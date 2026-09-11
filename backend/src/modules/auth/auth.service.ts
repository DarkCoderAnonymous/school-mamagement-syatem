import type { AuthUser, LoginResponse, RefreshResponse } from '@sms/shared';
import { School } from '../../models/School';
import { Subscription } from '../../models/Subscription';
import { RoleModel } from '../../models/Role';
import { User, type UserDoc } from '../../models/User';
import { RefreshToken } from '../../models/RefreshToken';
import { AppError } from '../../utils/AppError';
import { hashPassword, verifyPassword } from '../../utils/password';
import { generateOpaqueToken, refreshTokenExpiryDate, sha256Hex, signAccessToken } from '../../utils/tokens';
import { recordAudit } from '../../utils/audit';
import { enqueueMail } from '../../jobs/mailer.queue';
import type { HydratedDocument, Types } from 'mongoose';
import type { LoginInput } from './auth.validation';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

async function resolveRolesAndPermissions(roleIds: Types.ObjectId[]) {
  const roles = await RoleModel.find({ _id: { $in: roleIds } }).lean();
  const permissions = Array.from(new Set(roles.flatMap((r) => r.permissions)));
  const roleNames = roles.map((r) => r.name);
  return { roleNames, permissions };
}

async function buildAuthUser(user: HydratedDocument<UserDoc>): Promise<AuthUser> {
  const { roleNames, permissions } = await resolveRolesAndPermissions(user.roles as Types.ObjectId[]);
  let school: { name: string; logoUrl: string | null; primaryColor: string | null } | null = null;
  if (user.schoolId) {
    const doc = await School.findById(user.schoolId).lean();
    if (doc) school = { name: doc.name, logoUrl: doc.logoUrl ?? null, primaryColor: doc.primaryColor ?? null };
  }

  return {
    id: String(user._id),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    schoolId: user.schoolId ? String(user.schoolId) : null,
    schoolName: school?.name ?? null,
    schoolLogoUrl: school?.logoUrl ?? null,
    schoolPrimaryColor: school?.primaryColor ?? null,
    roles: roleNames,
    permissions,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

async function issueTokens(
  user: HydratedDocument<UserDoc>,
  meta: RequestMeta,
): Promise<{ accessToken: string; refreshToken: string }> {
  const { roleNames, permissions } = await resolveRolesAndPermissions(user.roles as Types.ObjectId[]);
  const isSuperAdmin = roleNames.includes('SUPER_ADMIN');

  const accessToken = signAccessToken({
    sub: String(user._id),
    schoolId: user.schoolId ? String(user.schoolId) : null,
    isSuperAdmin,
    roles: roleNames,
    permissions,
  });

  const rawRefreshToken = generateOpaqueToken();
  await RefreshToken.create({
    schoolId: user.schoolId ?? null,
    userId: user._id,
    tokenHash: sha256Hex(rawRefreshToken),
    expiresAt: refreshTokenExpiryDate(),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { accessToken, refreshToken: rawRefreshToken };
}

/**
 * Login intentionally runs with no tenant context established (it's a
 * public route, ahead of the `authenticate` middleware) so this query is
 * unscoped by design — see tenant.plugin.ts's "no context => pass through"
 * branch. A user's email is unique per school ({schoolId,email}), and in
 * this slice every user is created either by the seed script or by school
 * approval (which sources the email from the globally-unique
 * SchoolRegistration.email), so in practice email is globally unique too;
 * this is a known simplification, not a general multi-school-same-email
 * disambiguation flow.
 */
export async function login(input: LoginInput, meta: RequestMeta): Promise<LoginResponse> {
  const user = await User.findOne({ email: input.email.toLowerCase() });
  const passwordOk = user ? await verifyPassword(user.passwordHash, input.password) : false;

  if (!user || !passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (user.status === 'DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  if (user.schoolId) {
    const school = await School.findById(user.schoolId).lean();
    if (school && school.status === 'SUSPENDED') {
      throw new AppError(403, 'SCHOOL_SUSPENDED', "This school's account has been suspended");
    }

    const subscription = await Subscription.findOne({ schoolId: user.schoolId }).sort({ createdAt: -1 }).lean();
    if (subscription && ['SUSPENDED', 'CANCELLED'].includes(subscription.status ?? '')) {
      throw new AppError(403, 'SUBSCRIPTION_INACTIVE', "This school's subscription is not active");
    }
  }

  const tokens = await issueTokens(user, meta);
  user.lastLoginAt = new Date();
  await user.save();

  await recordAudit({
    schoolId: user.schoolId,
    actorUserId: user._id,
    action: 'auth.login',
    entity: 'User',
    entityId: user._id,
    ip: meta.ip,
  });

  const authUser = await buildAuthUser(user);
  return { user: authUser, ...tokens };
}

export async function refresh(rawRefreshToken: string, meta: RequestMeta): Promise<RefreshResponse> {
  const tokenHash = sha256Hex(rawRefreshToken);
  const stored = await RefreshToken.findOne({ tokenHash });

  if (!stored) throw AppError.unauthorized('Invalid refresh token');

  if (stored.revokedAt) {
    // Reuse of an already-rotated token is a signal of theft — revoke the
    // whole family (every token for this user) rather than just this one.
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

  const tokens = await issueTokens(user, meta);
  stored.revokedAt = new Date();
  stored.replacedByTokenHash = sha256Hex(tokens.refreshToken);
  await stored.save();

  return tokens;
}

export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return;
  const tokenHash = sha256Hex(rawRefreshToken);
  await RefreshToken.updateOne({ tokenHash, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function me(userId: string): Promise<AuthUser> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  return buildAuthUser(user);
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase() });
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

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
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

  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');

  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw AppError.badRequest('Current password is incorrect');

  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();
}
