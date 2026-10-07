import type { ClientSession, Types } from 'mongoose';
import { Role } from '@sms/shared';
import { User } from '../models/User';
import { RoleModel } from '../models/Role';
import { SchoolMembership } from '../models/SchoolMembership';
import { AppError } from '../utils/AppError';
import { generateTempPassword, hashPassword } from '../utils/password';
import { TenantContext } from '../tenant/context';
import { enqueueMail } from '../jobs/mailer.queue';
import { bumpMembershipEpoch } from './auth-freshness.service';

export interface ProvisionAccountInput {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  /** Default roles by name… */
  roles?: Role[];
  /** …or explicit role ids (custom roles), already verified to belong to this school. */
  roleIds?: (Types.ObjectId | string)[];
  links?: {
    teacherId?: Types.ObjectId | string | null;
    guardianId?: Types.ObjectId | string | null;
    studentId?: Types.ObjectId | string | null;
  };
}

export interface ProvisionedAccount {
  userId: Types.ObjectId;
  membershipId: Types.ObjectId;
  email: string;
  /** Set only when a brand-new identity was created; null when an existing person was linked. */
  tempPassword: string | null;
  /** True when the person already had a membership here and it was extended. */
  extendedExistingMembership: boolean;
}

/** The acting school's roles by name. Role is a platform collection, so it's scoped by hand. */
export async function schoolRoleIds(names: Role[], session?: ClientSession): Promise<Types.ObjectId[]> {
  const schoolId = TenantContext.getSchoolId();
  if (!schoolId) throw AppError.forbidden('No school context');
  const roles = await RoleModel.find({ schoolId, name: { $in: names }, deletedAt: null })
    .session(session ?? null)
    .lean();
  const missing = names.filter((n) => !roles.some((r) => r.name === n));
  if (missing.length) {
    throw AppError.internal(`School is missing default role(s): ${missing.join(', ')} — run backfill:permissions`);
  }
  return roles.map((r) => r._id);
}

/**
 * Gives a person a sign-in at the acting school (ADR-001: identity is global,
 * tenancy is a membership).
 *
 *  - New email → a User with a temporary password and forced change, plus a
 *    membership holding `roles`.
 *  - Known email, no membership here → the existing identity gets a new
 *    membership. Their password is NOT touched: they already sign in
 *    somewhere, and resetting it would lock them out of the other school.
 *  - Known email, already a member here → roles are merged into the existing
 *    membership and the domain link is set (an admin who also teaches), and
 *    the membership's epoch is bumped so their live token picks it up (ADR-005).
 *
 * Runs inside the caller's transaction. Mail is NOT sent here — see
 * `sendAccountEmail`, which the caller runs after commit so a rolled-back
 * transaction never emails a password that doesn't exist.
 */
export async function provisionSchoolAccount(
  input: ProvisionAccountInput,
  session: ClientSession,
): Promise<ProvisionedAccount> {
  const email = input.email.trim().toLowerCase();
  const roleIds = [
    ...(input.roles?.length ? await schoolRoleIds(input.roles, session) : []),
    ...(input.roleIds ?? []),
  ];
  if (roleIds.length === 0) throw AppError.badRequest('At least one role is required', { field: 'roleIds' });
  const links = Object.fromEntries(
    Object.entries(input.links ?? {}).filter(([, v]) => v !== undefined && v !== null),
  );

  let user = await User.findOne({ email }).session(session);
  let tempPassword: string | null = null;

  // Platform accounts belong to no school by definition (ADR-001). Same
  // message as any other unusable address, so it doesn't reveal who the
  // platform operators are.
  if (user && user.platformRoleIds.length > 0) {
    throw AppError.conflict('This email address cannot be used for a school account', { field: 'email' });
  }

  if (!user) {
    tempPassword = generateTempPassword();
    const [created] = await User.create(
      [
        {
          email,
          passwordHash: await hashPassword(tempPassword),
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          status: 'ACTIVE',
          mustChangePassword: true,
        },
      ],
      { session },
    );
    if (!created) throw AppError.internal('Failed to create the account');
    user = created;
  }

  const existing = await SchoolMembership.findOne({ userId: user._id, deletedAt: null }).session(session);
  if (existing) {
    // A disabled membership that still holds roles was switched off on
    // purpose. Quietly re-activating it here would hand all of those roles
    // back through a side door (a new guardian or teacher record needs only
    // student/teacher permissions, not the right to re-enable staff), so the
    // Staff screen's enable action is the one place that decides it. One left
    // with no roles (a removed teacher) grants nothing but the role being
    // added now, so re-adding that person keeps working as before.
    if (existing.status === 'DISABLED' && existing.roleIds.length > 0) {
      throw AppError.conflict(
        "This person's access to your school is disabled. Re-enable them from Staff first, then try again.",
        { field: 'email' },
      );
    }
    const merged = new Set([...existing.roleIds.map(String), ...roleIds.map(String)]);
    existing.set('roleIds', [...merged]);
    existing.set(links);
    // Only a role-less membership gets here disabled (see above).
    if (existing.status === 'DISABLED') existing.status = 'ACTIVE';
    await existing.save({ session });
    await bumpMembershipEpoch(String(existing._id), session);
    return {
      userId: user._id,
      membershipId: existing._id,
      email,
      tempPassword,
      extendedExistingMembership: true,
    };
  }

  const [membership] = await SchoolMembership.create(
    [{ userId: user._id, roleIds, status: 'ACTIVE', ...links }],
    { session },
  );
  if (!membership) throw AppError.internal('Failed to create the school membership');

  return {
    userId: user._id,
    membershipId: membership._id,
    email,
    tempPassword,
    extendedExistingMembership: false,
  };
}

/** Sends the sign-in email for a just-provisioned account. Call after the transaction commits. */
export async function sendAccountEmail(
  account: Pick<ProvisionedAccount, 'email' | 'tempPassword'>,
  what: string,
): Promise<void> {
  await enqueueMail({
    to: account.email,
    subject: 'Your school account is ready',
    body: account.tempPassword
      ? `You've been added as ${what}. Sign in with ${account.email} and temporary password ${account.tempPassword}. You'll be asked to choose your own password on first sign-in.`
      : `You've been added as ${what}. Sign in with your existing ${account.email} account — you'll be asked which school to open.`,
  });
}
