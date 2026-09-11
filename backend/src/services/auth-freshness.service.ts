import type { ClientSession } from 'mongoose';
import { redis } from '../config/redis';
import { SchoolMembership } from '../models/SchoolMembership';
import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { AppError } from '../utils/AppError';
import { TenantContext } from '../tenant/context';
import type { AccessTokenPayload } from '../modules/auth/auth.types';

/**
 * Permission freshness (ADR-005).
 *
 * Permissions are denormalized into the access token so `requirePermission`
 * can check them in memory. The cost is staleness: without this module a
 * removed permission stays usable until the token expires (15 minutes).
 *
 * Two signals close that window, deliberately different in severity:
 *
 *   permissionsEpoch  — per membership, bumped on any role change. A stale
 *                       token costs one silent refresh, not the session.
 *   sessionsValidFrom — per user, set on disable/password change. Tokens
 *                       issued earlier are dead; refresh cannot revive them.
 *
 * Neither may put the database on the per-request path, so both are read
 * through Redis with a short in-process cache in front. Redis being
 * unavailable must NOT fail open — "revoke access now" cannot be silently
 * conditional on infrastructure health — so the fallback is a direct read.
 */

/** Short enough that a bump lands almost immediately, long enough to absorb bursts. */
const PROCESS_CACHE_TTL_MS = 5_000;
const REDIS_TTL_SECONDS = 300;

interface CacheEntry {
  value: number;
  expiresAt: number;
}

const processCache = new Map<string, CacheEntry>();

function readProcessCache(key: string): number | undefined {
  const hit = processCache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    processCache.delete(key);
    return undefined;
  }
  return hit.value;
}

function writeProcessCache(key: string, value: number): void {
  processCache.set(key, { value, expiresAt: Date.now() + PROCESS_CACHE_TTL_MS });
}

/** Test seam: the in-process layer would otherwise mask a bump within its TTL. */
export function clearFreshnessCache(): void {
  processCache.clear();
}

async function readThrough(key: string, loadFromDb: () => Promise<number>): Promise<number> {
  const cached = readProcessCache(key);
  if (cached !== undefined) return cached;

  try {
    const fromRedis = await redis.get(key);
    if (fromRedis !== null) {
      const value = Number(fromRedis);
      writeProcessCache(key, value);
      return value;
    }
  } catch {
    // Redis unreachable — fall through to the database rather than guessing.
    // Logged by the shared connection's error handler, not here, so an
    // outage doesn't emit one line per request.
  }

  const value = await loadFromDb();
  writeProcessCache(key, value);
  // Best-effort warm; a failure here just means the next request reads the DB.
  void redis.set(key, String(value), 'EX', REDIS_TTL_SECONDS).catch(() => undefined);
  return value;
}

const epochKey = (membershipId: string) => `auth:epoch:${membershipId}`;
const sessionsKey = (userId: string) => `auth:svf:${userId}`;

async function loadEpochFromDb(membershipId: string): Promise<number> {
  // Membership is tenant-scoped, and this runs before the tenant context is
  // established — it IS the check that decides whether the context is valid.
  //
  // The status and deletedAt filters are load-bearing, not tidiness: a
  // membership that was soft-deleted or disabled must stop authorising
  // immediately. Looking it up by id alone would keep returning a valid
  // epoch, and a removed teacher would keep working until their token
  // expired — precisely the window this module exists to close.
  const membership = await TenantContext.runAsSystem(async () =>
    SchoolMembership.findOne({ _id: membershipId, status: 'ACTIVE', deletedAt: null })
      .select('permissionsEpoch')
      .lean(),
  );
  // No usable membership means no valid epoch. -1 never matches a real
  // token's value, so the session is rejected rather than waved through.
  return membership?.permissionsEpoch ?? -1;
}

async function loadSessionsValidFromDb(userId: string): Promise<number> {
  const user = await User.findById(userId).select('sessionsValidFrom').lean();
  return user?.sessionsValidFrom ? new Date(user.sessionsValidFrom).getTime() : 0;
}

/**
 * Throws when the token no longer reflects reality. Called by `authenticate`
 * on every authenticated request.
 *
 * TOKEN_STALE and SESSION_REVOKED are distinct on purpose: the first is
 * routine and the client silently refreshes, the second is deliberate and the
 * client must sign in again. Conflating them makes it impossible to tell
 * normal churn from an epoch being bumped in a loop.
 */
export async function assertTokenFresh(payload: AccessTokenPayload): Promise<void> {
  const issuedAtMs = (payload.iat ?? 0) * 1000;
  const validFrom = await readThrough(sessionsKey(payload.sub), () =>
    loadSessionsValidFromDb(payload.sub),
  );

  // Tokens issued in the same second as the revocation are treated as revoked:
  // `iat` has one-second resolution, so `>` would let a token minted moments
  // before the cutoff survive it.
  if (validFrom > 0 && issuedAtMs <= validFrom) {
    throw new AppError(401, 'SESSION_REVOKED', 'This session has been ended. Sign in again.');
  }

  // A platform SUPER_ADMIN acts through no membership, so there is no epoch
  // to compare — `sessionsValidFrom` is their revocation path.
  if (!payload.membershipId) return;

  const current = await readThrough(epochKey(payload.membershipId), () =>
    loadEpochFromDb(payload.membershipId!),
  );

  if (current !== payload.permissionsEpoch) {
    throw new AppError(401, 'TOKEN_STALE', 'Your permissions changed. Refreshing your session.');
  }
}

/**
 * Called by whatever changes what a membership may do: assigning or removing
 * roles, or editing a role that memberships hold.
 *
 * Writes the database first and the caches second. The reverse order would
 * leave a window where a cached epoch is ahead of the stored one, which
 * rejects every token until the cache expires.
 */
export async function bumpMembershipEpoch(
  membershipId: string,
  session?: ClientSession,
): Promise<number> {
  const updated = await TenantContext.runAsSystem(async () =>
    SchoolMembership.findByIdAndUpdate(
      membershipId,
      { $inc: { permissionsEpoch: 1 } },
      { new: true, select: 'permissionsEpoch', ...(session ? { session } : {}) },
    ).lean(),
  );

  if (!updated) throw AppError.notFound('Membership not found');

  const key = epochKey(membershipId);
  processCache.delete(key);
  // Delete rather than set: inside a transaction the new value isn't visible
  // to other readers yet, so caching it early would publish an uncommitted
  // number. The next read re-populates from whatever actually committed.
  void redis.del(key).catch(() => undefined);

  return updated.permissionsEpoch;
}

/** Bumps every membership that holds a given role — used when a role's permissions are edited. */
export async function bumpEpochForRole(roleId: string): Promise<number> {
  const memberships = await TenantContext.runAsSystem(async () =>
    SchoolMembership.find({ roleIds: roleId, deletedAt: null }).select('_id').lean(),
  );

  for (const membership of memberships) {
    await bumpMembershipEpoch(String(membership._id));
  }
  return memberships.length;
}

/**
 * Hard revocation: ends every session this person has, everywhere, now.
 *
 * Used for account disable, password change, and suspected compromise. Unlike
 * an epoch bump this cannot be recovered by refreshing — that is the entire
 * point, so the refresh tokens are revoked too.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  const now = new Date();

  await User.findByIdAndUpdate(userId, { $set: { sessionsValidFrom: now } });
  await TenantContext.runAsSystem(async () =>
    RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now } }),
  );

  const key = sessionsKey(userId);
  processCache.delete(key);
  void redis.del(key).catch(() => undefined);
}
