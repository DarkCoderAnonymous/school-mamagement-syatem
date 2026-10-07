import type { ClientSession, Types } from 'mongoose';
import { Role } from '@sms/shared';
import { RoleModel, type RoleDoc } from '../../models/Role';
import { SchoolMembership } from '../../models/SchoolMembership';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { withTransaction } from '../../utils/transaction';
import { TenantContext } from '../../tenant/context';
import { bumpEpochForRole } from '../../services/auth-freshness.service';
import { MODULE_LABELS, PERMISSION_CATALOG, SCHOOL_ASSIGNABLE_PERMISSIONS } from '../../rbac/permissions.catalog';
import type { CreateRoleInput, UpdateRoleInput } from './roles.validation';

/** The caller, as far as role management needs to know. */
export interface RoleActor extends ActorMeta {
  membershipId: string | null;
  permissions: string[];
}

/** Family accounts come from the student screens, where they get linked to a guardian or student. */
export const FAMILY_ROLES: string[] = [Role.PARENT, Role.STUDENT];

/**
 * Names a custom role may not take, compared after normalising case and
 * separators. Code and clients still branch on these names (routing a
 * SUPER_ADMIN to /admin, family-role checks, the last-admin guard), so a
 * school role called "Super Admin" or "parent" must not exist.
 */
const RESERVED_NAMES = new Set<string>(Object.values(Role));
const normaliseName = (name: string) => name.trim().replace(/[\s\-/]+/g, '_').toUpperCase();

export function currentSchoolId(): string {
  const schoolId = TenantContext.getSchoolId();
  if (!schoolId) throw AppError.forbidden('No school context');
  return schoolId;
}

/** This school's roles. Role is a platform collection, so scoping is explicit here. */
export async function schoolRoles(session?: ClientSession) {
  return RoleModel.find({ schoolId: currentSchoolId(), deletedAt: null })
    .sort({ name: 1 })
    .session(session ?? null)
    .lean();
}

function toView(r: Pick<RoleDoc, '_id' | 'name' | 'description' | 'isSystem' | 'permissions'>, memberCount: number) {
  return {
    _id: r._id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isFamilyRole: FAMILY_ROLES.includes(r.name),
    permissions: r.permissions,
    memberCount,
  };
}

export async function listRoles() {
  const roles = await schoolRoles();
  const counts = await SchoolMembership.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { deletedAt: null, status: 'ACTIVE' } },
    { $unwind: '$roleIds' },
    { $group: { _id: '$roleIds', count: { $sum: 1 } } },
  ]);
  const byRole = new Map(counts.map((c) => [String(c._id), c.count]));
  return roles.map((r) => toView(r, byRole.get(String(r._id)) ?? 0));
}

/**
 * The permissions a custom role can be built from, grouped by module in a
 * stable order. Permissions the caller lacks are included — the editor shows
 * them disabled — but createRole/updateRole refuse them.
 */
export function listPermissionModules() {
  const order = Object.keys(MODULE_LABELS);
  const modules = new Map<string, { code: string; description: string }[]>();
  for (const entry of PERMISSION_CATALOG) {
    if (!SCHOOL_ASSIGNABLE_PERMISSIONS.has(entry.code)) continue;
    modules.set(entry.module, [...(modules.get(entry.module) ?? []), { code: entry.code, description: entry.description }]);
  }
  return [...modules.entries()]
    .sort(([a], [b]) => (order.indexOf(a) + 1 || order.length + 1) - (order.indexOf(b) + 1 || order.length + 1))
    .map(([module, permissions]) => ({ module, label: MODULE_LABELS[module] ?? module, permissions }));
}

/**
 * A custom role may only carry school-level permissions the caller holds —
 * the same anti-escalation rule as assigning a role (members.service
 * assertAssignable). Without it, `role.manage` plus `role.assign` would let
 * someone mint a role with any power and hand it out.
 */
function assertGrantable(permissions: string[], actor: RoleActor): string[] {
  const unique = [...new Set(permissions)];
  const unknown = unique.filter((p) => !SCHOOL_ASSIGNABLE_PERMISSIONS.has(p));
  if (unknown.length) {
    throw AppError.badRequest('Some permissions are not available to school roles', { field: 'permissions', unknown });
  }
  const held = new Set(actor.permissions);
  const beyond = unique.filter((p) => !held.has(p));
  if (beyond.length) {
    throw new AppError(403, 'FORBIDDEN', 'A role can only include permissions you have yourself', {
      field: 'permissions',
      beyond,
    });
  }
  return unique;
}

async function assertNameFree(name: string, exceptId?: string): Promise<void> {
  const normalised = normaliseName(name);
  if (RESERVED_NAMES.has(normalised)) {
    throw AppError.badRequest(`"${name}" is a built-in role name — pick another`, { field: 'name' });
  }
  const clash = (await schoolRoles()).find((r) => String(r._id) !== exceptId && normaliseName(r.name) === normalised);
  if (clash) throw AppError.conflict(`There's already a role called "${clash.name}"`, { field: 'name' });
}

/** Loads a custom role of this school the caller is allowed to change. */
async function loadEditable(id: string, actor: RoleActor, verb: 'edit' | 'delete') {
  const role = await RoleModel.findOne({ _id: id, schoolId: currentSchoolId(), deletedAt: null });
  if (!role) throw AppError.notFound('Role not found');
  if (role.isSystem) {
    throw AppError.forbidden(`Built-in roles can't be changed — duplicate ${role.name} as a custom role instead`);
  }
  // Editing a role you couldn't have created would let you strip (or, with a
  // rename, repurpose) powers you don't hold from everyone who has it.
  const held = new Set(actor.permissions);
  if (role.permissions.some((p) => !held.has(p))) {
    throw AppError.forbidden(`You can't ${verb} ${role.name}: it includes permissions you don't have`);
  }
  return role;
}

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number }).code === 11000;
}

export async function createRole(input: CreateRoleInput, actor: RoleActor) {
  const permissions = assertGrantable(input.permissions, actor);
  await assertNameFree(input.name);

  try {
    const role = await withTransaction(async (session) => {
      const [doc] = await RoleModel.create(
        [{ schoolId: currentSchoolId(), name: input.name, description: input.description, isSystem: false, permissions }],
        { session },
      );
      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'role.create',
        entity: 'Role',
        entityId: doc!._id,
        after: doc!.toObject(),
        ip: actor.ip,
        session,
      });
      return doc!;
    });
    return toView(role, 0);
  } catch (err) {
    if (isDuplicateKey(err)) throw AppError.conflict(`There's already a role called "${input.name}"`, { field: 'name' });
    throw err;
  }
}

export async function updateRole(id: string, input: UpdateRoleInput, actor: RoleActor) {
  const role = await loadEditable(id, actor, 'edit');
  const permissions = input.permissions ? assertGrantable(input.permissions, actor) : undefined;
  if (input.name !== undefined) await assertNameFree(input.name, id);

  const before = role.toObject();
  const permissionsChanged =
    permissions !== undefined &&
    (permissions.length !== role.permissions.length || permissions.some((p) => !role.permissions.includes(p)));

  try {
    await withTransaction(async (session) => {
      if (input.name !== undefined) role.name = input.name;
      if (input.description !== undefined) role.description = input.description || undefined;
      if (permissions !== undefined) role.permissions = permissions;
      await role.save({ session });
      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'role.update',
        entity: 'Role',
        entityId: role._id,
        before,
        after: role.toObject(),
        ip: actor.ip,
        session,
      });
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw AppError.conflict(`There's already a role called "${input.name}"`, { field: 'name' });
    throw err;
  }

  // Permissions are denormalised into access tokens, so everyone holding this
  // role must refresh (ADR-005). After the commit, not inside it: a bump seen
  // before the new permission list is visible would let a refresh mint a token
  // with the old list and the new epoch, which nothing would then correct.
  if (permissionsChanged) await bumpEpochForRole(id);

  const memberCount = await SchoolMembership.countDocuments({ roleIds: role._id, deletedAt: null, status: 'ACTIVE' });
  return toView(role, memberCount);
}

/**
 * Soft-deletes a custom role nobody holds. Refusing while it's assigned
 * (disabled members included — they can be re-enabled) keeps a deletion from
 * silently changing what people can do; the admin moves them first.
 */
export async function deleteRole(id: string, actor: RoleActor): Promise<void> {
  const role = await loadEditable(id, actor, 'delete');
  const before = role.toObject();

  await withTransaction(async (session) => {
    const holders = await SchoolMembership.countDocuments({ roleIds: role._id, deletedAt: null }).session(session);
    if (holders > 0) {
      throw AppError.conflict(
        `${holders} ${holders === 1 ? 'person has' : 'people have'} this role — change their roles before deleting it`,
      );
    }
    role.deletedAt = new Date();
    await role.save({ session });
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'role.delete',
      entity: 'Role',
      entityId: role._id,
      before,
      after: role.toObject(),
      ip: actor.ip,
      session,
    });
  });
}
