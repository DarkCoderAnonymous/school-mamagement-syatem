import type { ClientSession, Types } from 'mongoose';
import { Role } from '@sms/shared';
import { SchoolMembership } from '../../models/SchoolMembership';
import type { RoleDoc } from '../../models/Role';
import { User } from '../../models/User';
import { Employee } from '../../models/Employee';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import { parsePaginationQuery } from '../../utils/paginate';
import { searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { withTransaction } from '../../utils/transaction';
import { bumpMembershipEpoch } from '../../services/auth-freshness.service';
import { provisionSchoolAccount, sendAccountEmail } from '../../services/school-accounts.service';
import { FAMILY_ROLES, schoolRoles, type RoleActor } from '../roles/roles.service';
import { ensureTeacherRecord } from '../teachers/teachers.service';
import type { InviteMemberInput } from './members.validation';
import { assertAdminRemains, assertMayChangeAccess } from './member-guards';

export type { RoleActor };

/**
 * The roles being granted must (a) belong to this school, (b) not be family
 * roles, and (c) carry no permission the caller lacks. (c) is the escalation
 * guard: `role.assign` alone must not let someone hand out — or take for
 * themselves via an accomplice — powers they don't hold.
 */
async function assertAssignable(roleIds: string[], actor: RoleActor, session?: ClientSession): Promise<RoleDoc[]> {
  const unique = [...new Set(roleIds)];
  const roles = (await schoolRoles(session)).filter((r) => unique.includes(String(r._id)));
  if (roles.length !== unique.length) throw AppError.badRequest('One or more roles were not found', { field: 'roleIds' });

  const family = roles.find((r) => FAMILY_ROLES.includes(r.name));
  if (family) {
    throw AppError.badRequest(`${family.name} accounts are created from the student and guardian screens`, {
      field: 'roleIds',
    });
  }

  const held = new Set(actor.permissions);
  const beyond = roles.find((r) => r.permissions.some((p) => !held.has(p)));
  if (beyond) {
    throw AppError.forbidden(`You can't assign ${beyond.name}: it includes permissions you don't have`);
  }
  return roles as RoleDoc[];
}

/**
 * Holding the built-in TEACHER role means being on the Teachers list, so
 * granting it from here creates the teacher record the Teachers page would
 * have. Details (subjects, qualification) are filled in there afterwards.
 */
async function ensureTeacherIfGranted(
  membershipId: Types.ObjectId | string,
  granted: RoleDoc[],
  person: { firstName: string; lastName: string; email: string; phone?: string },
  actor: RoleActor,
  session: ClientSession,
): Promise<void> {
  if (!granted.some((r) => r.name === Role.TEACHER)) return;
  await ensureTeacherRecord(membershipId, person, actor, session);
}

function toView(
  m: Record<string, unknown> & { roleIds: Types.ObjectId[]; userId: unknown },
  roles: { _id: Types.ObjectId; name: string }[],
) {
  const byId = new Map(roles.map((r) => [String(r._id), r]));
  const { userId, ...rest } = m;
  return {
    ...rest,
    user: userId,
    roles: m.roleIds.map((id) => byId.get(String(id))).filter(Boolean),
  };
}

const USER_SELECT = 'firstName lastName email phone status lastLoginAt mustChangePassword';

export async function listMembers(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const roles = await schoolRoles();
  const filter: Record<string, unknown> = { deletedAt: null };

  if (typeof query.status === 'string') filter.status = query.status;
  if (typeof query.roleId === 'string') {
    filter.roleIds = query.roleId;
  } else if (query.scope !== 'all') {
    filter.roleIds = { $in: roles.filter((r) => !FAMILY_ROLES.includes(r.name)).map((r) => r._id) };
  }

  if (search) {
    // Narrow by name/email through the people who are members HERE — never a
    // regex over the platform-wide User collection, which would be slow and
    // would scan other schools' people.
    const memberUserIds = await SchoolMembership.distinct('userId', filter);
    const rx = searchRegex(search);
    const matching = await User.find({
      _id: { $in: memberUserIds },
      $or: [{ firstName: rx }, { lastName: rx }, { email: rx }],
    })
      .select('_id')
      .lean();
    filter.userId = { $in: matching.map((u) => u._id) };
  }

  const [members, total] = await Promise.all([
    SchoolMembership.find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'userId', select: USER_SELECT })
      .lean(),
    SchoolMembership.countDocuments(filter),
  ]);

  return {
    items: members.map((m) => toView(m as never, roles)),
    meta: buildPaginationMeta(page, limit, total),
  };
}

export async function getMemberById(id: string) {
  const member = await SchoolMembership.findOne({ _id: id, deletedAt: null })
    .populate({ path: 'userId', select: USER_SELECT })
    .lean();
  if (!member) throw AppError.notFound('Staff member not found');
  // Their staff record here, if they have one (teachers always do; office staff
  // once they're on payroll) — what attendance and salary hang off.
  const userId = (member.userId as unknown as { _id: Types.ObjectId } | null)?._id;
  const employee = userId
    ? await Employee.findOne({ userId, deletedAt: null }).select('employeeNumber designation department joiningDate status').lean()
    : null;
  return { ...toView(member as never, await schoolRoles()), employee };
}

export async function inviteMember(input: InviteMemberInput, actor: RoleActor) {
  const granted = await assertAssignable(input.roleIds, actor);

  const account = await withTransaction(async (session) => {
    const provisioned = await provisionSchoolAccount(
      {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        roleIds: input.roleIds,
      },
      session,
    );
    const person = { firstName: input.firstName, lastName: input.lastName, email: provisioned.email, phone: input.phone };
    await ensureTeacherIfGranted(provisioned.membershipId, granted, person, actor, session);
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: provisioned.extendedExistingMembership ? 'member.roles.add' : 'member.invite',
      entity: 'SchoolMembership',
      entityId: provisioned.membershipId,
      after: { userId: provisioned.userId, roleIds: input.roleIds },
      ip: actor.ip,
      session,
    });
    return provisioned;
  });

  const roleNames = (await schoolRoles())
    .filter((r) => input.roleIds.includes(String(r._id)))
    .map((r) => r.name.replace(/_/g, ' ').toLowerCase());
  await sendAccountEmail(account, roleNames.join(', '));
  return getMemberById(String(account.membershipId));
}

export async function updateMemberRoles(id: string, roleIds: string[], actor: RoleActor) {
  if (id === actor.membershipId) {
    throw AppError.forbidden("You can't change your own roles — ask another administrator");
  }
  const member = await SchoolMembership.findOne({ _id: id, deletedAt: null });
  if (!member) throw AppError.notFound('Staff member not found');
  const granted = await assertAssignable(roleIds, actor);

  // Family roles already on the membership (a teacher who is also a parent)
  // are kept: they're owned by the guardian/student link, not this screen.
  const roles = await schoolRoles();
  const keptFamily = member.roleIds.filter((r) =>
    roles.some((role) => String(role._id) === String(r) && FAMILY_ROLES.includes(role.name)),
  );
  // Removing a role you don't hold would be as much an escalation lever as granting one.
  const removed = member.roleIds.filter(
    (r) => !roleIds.includes(String(r)) && !keptFamily.some((k) => String(k) === String(r)),
  );
  await assertAssignable(removed.map(String), actor).catch((err: unknown) => {
    if (err instanceof AppError && err.statusCode === 403) {
      throw AppError.forbidden("You can't remove a role that includes permissions you don't have");
    }
    throw err;
  });

  const before = member.toObject();
  await withTransaction(async (session) => {
    member.set('roleIds', [...keptFamily.map(String), ...new Set(roleIds)]);
    await member.save({ session });
    const user = await User.findById(member.userId).select('firstName lastName email phone').session(session).lean();
    if (user) await ensureTeacherIfGranted(member._id, granted, user, actor, session);
    await assertAdminRemains(session);
    await bumpMembershipEpoch(String(member._id), session);
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'member.roles.update',
      entity: 'SchoolMembership',
      entityId: member._id,
      before,
      after: member.toObject(),
      ip: actor.ip,
      session,
    });
  });
  return getMemberById(id);
}

/**
 * Enables or disables someone's access to THIS school only. Their identity
 * and any other school's membership are untouched (ADR-001). A disabled
 * membership fails the epoch lookup, so access ends on the next request.
 */
export async function updateMemberStatus(id: string, status: 'ACTIVE' | 'DISABLED', actor: RoleActor) {
  if (id === actor.membershipId) throw AppError.forbidden("You can't change your own access");
  const member = await SchoolMembership.findOne({ _id: id, deletedAt: null });
  if (!member) throw AppError.notFound('Staff member not found');
  // Same bar as changing their roles: `user.update` alone mustn't let someone
  // disable (or re-enable) a person who holds more than they do.
  await assertMayChangeAccess(member, actor);

  const before = member.toObject();
  await withTransaction(async (session) => {
    member.status = status;
    await member.save({ session });
    await assertAdminRemains(session);
    await bumpMembershipEpoch(String(member._id), session);
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: status === 'DISABLED' ? 'member.disable' : 'member.enable',
      entity: 'SchoolMembership',
      entityId: member._id,
      before,
      after: member.toObject(),
      ip: actor.ip,
      session,
    });
  });
  return getMemberById(id);
}
