import type { ClientSession, Types } from 'mongoose';
import { Role } from '@sms/shared';
import { SchoolMembership } from '../../models/SchoolMembership';
import { AppError } from '../../utils/AppError';
import { FAMILY_ROLES, schoolRoles, type RoleActor } from '../roles/roles.service';

/**
 * Guards shared by every path that changes whether a membership may be used —
 * the Staff screen's enable/disable and the Teachers screen's status field —
 * so a side door can't do what the front door refuses.
 */

/**
 * A school must always keep at least one active School Admin — otherwise
 * nobody can manage roles again short of platform support.
 */
export async function assertAdminRemains(session: ClientSession): Promise<void> {
  const adminRole = (await schoolRoles(session)).find((r) => r.name === Role.SCHOOL_ADMIN);
  if (!adminRole) return;
  const admins = await SchoolMembership.countDocuments({
    roleIds: adminRole._id,
    status: 'ACTIVE',
    deletedAt: null,
  }).session(session);
  if (admins === 0) throw AppError.conflict('The school must keep at least one active School Admin');
}

/**
 * The anti-escalation rule applied to switching someone's access on or off:
 * you may only do it to a person whose roles grant nothing you don't hold
 * yourself. Otherwise a narrow permission (`user.update`, `teacher.update`)
 * would let its holder lock out — or bring back — someone more powerful.
 *
 * Family roles are owned by the guardian/student link, never this decision.
 * `exemptRoleNames` covers the role the calling screen is itself responsible
 * for: `teacher.update` exists to manage teachers, so TEACHER's permissions
 * aren't counted against someone changing a teacher's status.
 */
export async function assertMayChangeAccess(
  membership: { _id: Types.ObjectId | string; roleIds: (Types.ObjectId | string)[] },
  actor: Pick<RoleActor, 'membershipId' | 'permissions'>,
  options: { exemptRoleNames?: string[]; session?: ClientSession } = {},
): Promise<void> {
  if (actor.membershipId && String(membership._id) === actor.membershipId) {
    throw AppError.forbidden("You can't change your own access");
  }
  const exempt = new Set([...FAMILY_ROLES, ...(options.exemptRoleNames ?? [])]);
  const held = new Set(actor.permissions);
  const targetRoleIds = new Set(membership.roleIds.map(String));
  const beyond = (await schoolRoles(options.session)).find(
    (r) => targetRoleIds.has(String(r._id)) && !exempt.has(r.name) && r.permissions.some((p) => !held.has(p)),
  );
  if (beyond) {
    throw AppError.forbidden(`You can't change the access of someone who is ${beyond.name}: it includes permissions you don't have`);
  }
}
