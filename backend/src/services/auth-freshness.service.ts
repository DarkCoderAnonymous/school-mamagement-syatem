import type { ClientSession } from 'mongoose';
import { redis } from '../config/redis';
import { SchoolMembership } from '../models/SchoolMembership';
import { School } from '../models/School';
import { Subscription } from '../models/Subscription';
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
 * A third signal is the school itself: a SUPER_ADMIN suspending a school (or
 * its subscription lapsing) must end its members' sessions on their next
 * request, not merely block their next login.
 *
 * None may put the database on the per-request path, so all are read
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
const schoolKey = (schoolId: string) => `auth:school:${schoolId}`;

/** Why a school can't be used right now. */
export type SchoolBlock = 'SCHOOL_SUSPENDED' | 'SUBSCRIPTION_INACTIVE';
export const SCHOOL_BLOCK_MESSAGE: Record<SchoolBlock, string> = {
  SCHOOL_SUSPENDED: "This school's account has been suspended",
  SUBSCRIPTION_INACTIVE: "This school's subscription is not active",
};
/** Cached as a number like the other signals: 0 = usable. */
const BLOCK_CODES: (SchoolBlock | null)[] = [null, 'SCHOOL_SUSPENDED', 'SUBSCRIPTION_INACTIVE'];

/**
 * The one rule for whether a school may be used — login, refresh and every
 * request all ask this, so they can never disagree. School and Subscription
 * are platform collections, so this needs no tenant context.
 */
export async function schoolBlockFromDb(schoolId: string): Promise<SchoolBlock | null> {
  const school = await School.findById(schoolId).select('status').lean();
  if (school && school.status === 'SUSPENDED') return 'SCHOOL_SUSPENDED';
  const subscription = await Subscription.findOne({ schoolId }).sort({ createdAt: -1 }).select('status').lean();
  if (subscription && ['SUSPENDED', 'CANCELLED'].includes(subscription.status ?? '')) return 'SUBSCRIPTION_INACTIVE';
  return null;
}

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
  // Read together, judged in order below: with Redis down each miss waits on
  // its timeout, so reading one after another would add those waits up.
  const [validFrom, current, blockCode] = await Promise.all([
    readThrough(sessionsKey(payload.sub), () => loadSessionsValidFromDb(payload.sub)),
    // A platform SUPER_ADMIN acts through no membership, so there is no epoch
    // to compare and no school to be suspended from — `sessionsValidFrom` is
    // their revocation path.
    payload.membershipId ? readThrough(epochKey(payload.membershipId), () => loadEpochFromDb(payload.membershipId!)) : null,
    payload.membershipId && payload.schoolId
      ? readThrough(schoolKey(payload.schoolId), async () => BLOCK_CODES.indexOf(await schoolBlockFromDb(payload.schoolId!)))
      : 0,
  ]);

  // Tokens issued in the same second as the revocation are treated as revoked:
  // `iat` has one-second resolution, so `>` would let a token minted moments
  // before the cutoff survive it.
  if (validFrom > 0 && issuedAtMs <= validFrom) {
    throw new AppError(401, 'SESSION_REVOKED', 'This session has been ended. Sign in again.');
  }

  if (current !== null && current !== payload.permissionsEpoch) {
    throw new AppError(401, 'TOKEN_STALE', 'Your permissions changed. Refreshing your session.');
  }

  // 401, not 403: the session itself is no longer valid. The client's normal
  // 401 path then tries a refresh, which refuses too (403, the same code), and
  // the client signs the person out — no client change needed.
  const block = BLOCK_CODES[blockCode] ?? null;
  if (block) throw new AppError(401, block, SCHOOL_BLOCK_MESSAGE[block]);
}

/**
 * Called whenever a school's usability changes — suspended, reactivated, or
 * its subscription moved — so the new state reaches every request at once
 * (other processes within their 5-second in-process cache).
 */
export function invalidateSchoolAccess(schoolId: string): void {
  const key = schoolKey(schoolId);
  processCache.delete(key);
  void redis.del(key).catch(() => undefined);
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
