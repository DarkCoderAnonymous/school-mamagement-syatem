import type { HydratedDocument, Types } from 'mongoose';
import type {
  AuthUser,
  LoginInput,
  LoginResponse,
  MembershipSummary,
  RefreshResponse,
  SessionResponse,
} from '@sms/shared';
import { School } from '../../models/School';
import { Subscription } from '../../models/Subscription';
import { RoleModel } from '../../models/Role';
import { SchoolMembership, type SchoolMembershipDoc } from '../../models/SchoolMembership';
import { User, type UserDoc } from '../../models/User';
import { RefreshToken } from '../../models/RefreshToken';
import { AppError } from '../../utils/AppError';
import { hashPassword, verifyPassword } from '../../utils/password';
import {
  generateOpaqueToken,
  refreshTokenExpiryDate,
  sha256Hex,
  signAccessToken,
  signSelectionToken,
  verifySelectionToken,
} from '../../utils/tokens';
import { recordAudit } from '../../utils/audit';
import { enqueueMail } from '../../jobs/mailer.queue';
import { TenantContext } from '../../tenant/context';
import { revokeAllSessions } from '../../services/auth-freshness.service';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** A membership plus the school it points at, which is what tokens and pickers both need. */
interface ResolvedMembership {
  membership: SchoolMembershipDoc;
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolPrimaryColor: string | null;
  roleNames: string[];
  permissions: string[];
}

async function resolveRolesAndPermissions(roleIds: Types.ObjectId[]) {
  const roles = await RoleModel.find({ _id: { $in: roleIds } }).lean();
  const permissions = Array.from(new Set(roles.flatMap((r) => r.permissions)));
  const roleNames = roles.map((r) => r.name);
  return { roleNames, permissions };
}

/**
 * Memberships are tenant-scoped, and every caller here is either
 * pre-authentication or deliberately crossing schools to build a switcher, so
 * these reads run as system code (see TenantContext.runAsSystem).
 */
async function loadActiveMemberships(userId: Types.ObjectId | string): Promise<SchoolMembershipDoc[]> {
  return TenantContext.runAsSystem(async () =>
    SchoolMembership.find({ userId, status: 'ACTIVE', deletedAt: null }).lean(),
  );
}

async function resolveMembership(membership: SchoolMembershipDoc): Promise<ResolvedMembership> {
  const [school, { roleNames, permissions }] = await Promise.all([
    School.findById(membership.schoolId).lean(),
    resolveRolesAndPermissions(membership.roleIds),
  ]);

  return {
    membership,
    schoolName: school?.name ?? '',
    schoolLogoUrl: school?.logoUrl ?? null,
    schoolPrimaryColor: school?.primaryColor ?? null,
    roleNames,
    permissions,
  };
}

async function toSummaries(memberships: SchoolMembershipDoc[]): Promise<MembershipSummary[]> {
  const resolved = await Promise.all(memberships.map(resolveMembership));
  return resolved.map((r) => ({
    membershipId: String(r.membership._id),
    schoolId: String(r.membership.schoolId),
    schoolName: r.schoolName,
    schoolLogoUrl: r.schoolLogoUrl,
    schoolPrimaryColor: r.schoolPrimaryColor,
    roles: r.roleNames,
    status: r.membership.status,
  }));
}

/** A platform account belongs to no school — today only SUPER_ADMIN. */
async function resolvePlatformRoles(user: HydratedDocument<UserDoc> | UserDoc) {
  return resolveRolesAndPermissions(user.platformRoleIds ?? []);
}

async function buildAuthUser(
  user: UserDoc,
  active: ResolvedMembership | null,
  allMemberships: SchoolMembershipDoc[],
): Promise<AuthUser> {
  const platform = active ? null : await resolvePlatformRoles(user);

  return {
    id: String(user._id),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    schoolId: active ? String(active.membership.schoolId) : null,
    membershipId: active ? String(active.membership._id) : null,
    schoolName: active?.schoolName ?? null,
    schoolLogoUrl: active?.schoolLogoUrl ?? null,
    schoolPrimaryColor: active?.schoolPrimaryColor ?? null,
    roles: active ? active.roleNames : (platform?.roleNames ?? []),
    permissions: active ? active.permissions : (platform?.permissions ?? []),
    mustChangePassword: Boolean(user.mustChangePassword),
    memberships: await toSummaries(allMemberships),
  };
}

/**
 * Blocks a login into a school that can't currently be used. Checked at
 * selection time rather than at password time, because with several
 * memberships only one of them may be suspended.
 */
async function assertSchoolUsable(schoolId: Types.ObjectId): Promise<void> {
  const school = await School.findById(schoolId).lean();
  if (school && school.status === 'SUSPENDED') {
    throw new AppError(403, 'SCHOOL_SUSPENDED', "This school's account has been suspended");
  }

  const subscription = await Subscription.findOne({ schoolId }).sort({ createdAt: -1 }).lean();
  if (subscription && ['SUSPENDED', 'CANCELLED'].includes(subscription.status ?? '')) {
    throw new AppError(403, 'SUBSCRIPTION_INACTIVE', "This school's subscription is not active");
  }
}

async function issueTokens(
  user: UserDoc,
  active: ResolvedMembership | null,
  meta: RequestMeta,
): Promise<{ accessToken: string; refreshToken: string }> {
  const platform = active ? null : await resolvePlatformRoles(user);
  const roleNames = active ? active.roleNames : (platform?.roleNames ?? []);
  const permissions = active ? active.permissions : (platform?.permissions ?? []);

  const accessToken = signAccessToken({
    sub: String(user._id),
    membershipId: active ? String(active.membership._id) : null,
    schoolId: active ? String(active.membership.schoolId) : null,
    isSuperAdmin: roleNames.includes('SUPER_ADMIN'),
    roles: roleNames,
    permissions,
    // Stamped from the membership's stored value, never from a cache — a
    // cached epoch could be behind and would mint a token that is stale the
    // moment it is issued, looping the client through refresh (ADR-005).
    permissionsEpoch: active ? active.membership.permissionsEpoch : 0,
  });

  const rawRefreshToken = generateOpaqueToken();
  await TenantContext.runAsSystem(async () =>
    RefreshToken.create({
      schoolId: active ? active.membership.schoolId : null,
      membershipId: active ? active.membership._id : null,
      userId: user._id,
      tokenHash: sha256Hex(rawRefreshToken),
      expiresAt: refreshTokenExpiryDate(),
      ip: meta.ip,
      userAgent: meta.userAgent,
    }),
  );

  return { accessToken, refreshToken: rawRefreshToken };
}

/** Issues a full session for one membership, after every check has passed. */
async function startSession(
  user: HydratedDocument<UserDoc>,
  membership: SchoolMembershipDoc | null,
  allMemberships: SchoolMembershipDoc[],
  meta: RequestMeta,
): Promise<SessionResponse> {
  const active = membership ? await resolveMembership(membership) : null;
  if (active) await assertSchoolUsable(active.membership.schoolId);

  const tokens = await issueTokens(user, active, meta);
  user.lastLoginAt = new Date();
  await user.save();

  await recordAudit({
    schoolId: active ? active.membership.schoolId : null,
    actorUserId: user._id,
    action: 'auth.login',
    entity: 'User',
    entityId: user._id,
    ip: meta.ip,
    metadata: { membershipId: active ? String(active.membership._id) : null },
  });

  return { ...tokens, user: await buildAuthUser(user, active, allMemberships) };
}

/**
 * PRE-AUTHENTICATION boundary.
 *
 * These routes are public: they run ahead of the `authenticate` middleware,
 * so there is no tenant context, and the queries below genuinely must search
 * across schools — you cannot scope a login by a school the caller hasn't
 * proved membership of yet. Since the tenant plugin FAILS CLOSED, that has to
 * be declared rather than assumed, which is what `TenantContext.runAsSystem`
 * does in the wrappers at the bottom of this file.
 *
 * Email now identifies the person platform-wide (ADR-001), so the old
 * "which school's row is this?" ambiguity is gone.
 */
async function loginUnscoped(input: LoginInput, meta: RequestMeta): Promise<LoginResponse> {
  const user = await User.findOne({ email: input.email.toLowerCase(), deletedAt: null });
  const passwordOk = user ? await verifyPassword(user.passwordHash, input.password) : false;

  // Same failure for "no such person" and "wrong password", so the endpoint
  // can't be used to discover who has an account.
  if (!user || !passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (user.status === 'DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  const memberships = await loadActiveMemberships(user._id);

  // Platform account (SUPER_ADMIN): belongs to no school, so there is
  // nothing to choose.
  if (memberships.length === 0) {
    const platform = await resolvePlatformRoles(user);
    if (platform.roleNames.length === 0) {
      throw new AppError(
        403,
        'NO_ACTIVE_MEMBERSHIP',
        'This account is not active at any school. Contact your administrator.',
      );
    }
    const session = await startSession(user, null, [], meta);
    return { kind: 'tokens', ...session };
  }

  if (memberships.length === 1) {
    const session = await startSession(user, memberships[0]!, memberships, meta);
    return { kind: 'tokens', ...session };
  }

  // Several schools: hand back the choice, not a session. Picking one here
  // would silently decide which child's data a parent sees.
  return {
    kind: 'select-school',
    selectionToken: signSelectionToken(String(user._id)),
    memberships: await toSummaries(memberships),
  };
}

/** Second half of a multi-membership login. */
async function selectSchoolUnscoped(
  selectionToken: string,
  schoolId: string,
  meta: RequestMeta,
): Promise<SessionResponse> {
  const { sub } = verifySelectionToken(selectionToken);

  const user = await User.findOne({ _id: sub, deletedAt: null });
  if (!user || user.status === 'DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  const memberships = await loadActiveMemberships(user._id);
  const chosen = memberships.find((m) => String(m.schoolId) === schoolId);
  // Re-checked rather than trusted: the selection token proves who is
  // choosing, never what they may choose.
  if (!chosen) {
    throw new AppError(403, 'NO_ACTIVE_MEMBERSHIP', 'You do not have access to that school');
  }

  return startSession(user, chosen, memberships, meta);
}

async function refreshUnscoped(rawRefreshToken: string, meta: RequestMeta): Promise<RefreshResponse> {
  const tokenHash = sha256Hex(rawRefreshToken);
  const stored = await RefreshToken.findOne({ tokenHash });

  if (!stored) throw AppError.unauthorized('Invalid refresh token');

  if (stored.revokedAt) {
    // Reuse of an already-rotated token is a signal of theft — revoke the
    // whole family (every token for this person, across every school) rather
    // than just this one. A stolen credential is a person-level compromise.
    await RefreshToken.updateMany(
      { userId: stored.userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw AppError.unauthorized('Refresh token already used — session revoked');
  }

  if (stored.expiresAt < new Date()) {
    throw AppError.unauthorized('Refresh token expired');
  }

  const user = await User.findById(stored.userId);
  if (!user || user.status === 'DISABLED') {
    throw AppError.unauthorized('Account no longer active');
  }

  // A token issued before a hard revocation must not be revivable.
  if (user.sessionsValidFrom && stored.createdAt <= user.sessionsValidFrom) {
    throw new AppError(401, 'SESSION_REVOKED', 'This session has been ended. Sign in again.');
  }

  // Re-resolved from the database, which is what makes a refresh pick up a
  // permission change — and, with the epoch stamped in, what resolves a
  // TOKEN_STALE rejection.
  let active: ResolvedMembership | null = null;
  if (stored.membershipId) {
    const membership = await TenantContext.runAsSystem(async () =>
      SchoolMembership.findOne({ _id: stored.membershipId, status: 'ACTIVE', deletedAt: null }).lean(),
    );
    // Membership revoked mid-session: the refresh must fail rather than
    // quietly downgrade the session to a platform one.
    if (!membership) {
      throw new AppError(403, 'NO_ACTIVE_MEMBERSHIP', 'Your access to this school has been removed');
    }
    active = await resolveMembership(membership);
  }

  const tokens = await issueTokens(user, active, meta);
  stored.revokedAt = new Date();
  stored.replacedByTokenHash = sha256Hex(tokens.refreshToken);
  await stored.save();

  return tokens;
}

async function logoutUnscoped(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return;
  const tokenHash = sha256Hex(rawRefreshToken);
  await RefreshToken.updateOne({ tokenHash, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/**
 * Moves an authenticated session to another of the person's schools.
 *
 * Re-issuance, never mutation: a fresh pair bound to the new membership, and
 * the old refresh token revoked. Mutating a token's audience in place would
 * leave the refresh family describing a session that no longer exists.
 */
export async function switchSchool(
  userId: string,
  currentRefreshToken: string | undefined,
  schoolId: string,
  meta: RequestMeta,
): Promise<SessionResponse> {
  return TenantContext.runAsSystem(async () => {
    const user = await User.findOne({ _id: userId, deletedAt: null });
    if (!user || user.status === 'DISABLED') {
      throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
    }

    const memberships = await loadActiveMemberships(user._id);
    const target = memberships.find((m) => String(m.schoolId) === schoolId);
    if (!target) {
      throw new AppError(403, 'NO_ACTIVE_MEMBERSHIP', 'You do not have access to that school');
    }

    const session = await startSession(user, target, memberships, meta);

    if (currentRefreshToken) {
      await RefreshToken.updateOne(
        { tokenHash: sha256Hex(currentRefreshToken), revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    }

    await recordAudit({
      schoolId: target.schoolId,
      actorUserId: user._id,
      action: 'auth.switchSchool',
      entity: 'SchoolMembership',
      entityId: target._id,
      ip: meta.ip,
    });

    return session;
  });
}

export async function me(userId: string, membershipId: string | null): Promise<AuthUser> {
  return TenantContext.runAsSystem(async () => {
    const user = await User.findById(userId).lean();
    if (!user) throw AppError.notFound('User not found');

    const memberships = await loadActiveMemberships(userId);
    const activeDoc = membershipId
      ? (memberships.find((m) => String(m._id) === membershipId) ?? null)
      : null;
    const active = activeDoc ? await resolveMembership(activeDoc) : null;

    return buildAuthUser(user, active, memberships);
  });
}

async function forgotPasswordUnscoped(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null });
  // Always behave the same whether or not the email exists, so the endpoint
  // can't be used to enumerate registered accounts.
  if (!user) return;

  const rawToken = generateOpaqueToken();
  user.passwordResetTokenHash = sha256Hex(rawToken);
  user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  await enqueueMail({
    to: user.email,
    subject: 'Reset your password',
    body: `Use this token to reset your password (valid 1 hour): ${rawToken}`,
  });
}

async function resetPasswordUnscoped(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = sha256Hex(rawToken);
  const user = await User.findOne({ passwordResetTokenHash: tokenHash });
  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    throw AppError.badRequest('Invalid or expired reset token');
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  user.mustChangePassword = false;
  await user.save();

  // Hard revocation: a reset is the one flow where the person may not have
  // controlled the old sessions.
  await revokeAllSessions(String(user._id));
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');

  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw AppError.badRequest('Current password is incorrect');

  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();

  // Previously missing (ADR-005): changing a password after a suspected
  // compromise left every other session alive. It now ends them, matching
  // resetPassword.
  await revokeAllSessions(String(user._id));
}

/*
 * Public wrappers for the pre-authentication routes above. Each runs its
 * implementation as system code, because there is no tenant to scope to until
 * a token exists. Keeping the wrappers together makes the complete list of
 * unscoped entry points readable at a glance — if this list grows, that
 * should be a deliberate review, not a quiet addition.
 */
export function login(input: LoginInput, meta: RequestMeta): Promise<LoginResponse> {
  return TenantContext.runAsSystem(() => loginUnscoped(input, meta));
}

export function selectSchool(
  selectionToken: string,
  schoolId: string,
  meta: RequestMeta,
): Promise<SessionResponse> {
  return TenantContext.runAsSystem(() => selectSchoolUnscoped(selectionToken, schoolId, meta));
}

export function refresh(rawRefreshToken: string, meta: RequestMeta): Promise<RefreshResponse> {
  return TenantContext.runAsSystem(() => refreshUnscoped(rawRefreshToken, meta));
}

export function logout(rawRefreshToken: string | undefined): Promise<void> {
  return TenantContext.runAsSystem(() => logoutUnscoped(rawRefreshToken));
}

export function forgotPassword(email: string): Promise<void> {
  return TenantContext.runAsSystem(() => forgotPasswordUnscoped(email));
}

export function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  return TenantContext.runAsSystem(() => resetPasswordUnscoped(rawToken, newPassword));
}
