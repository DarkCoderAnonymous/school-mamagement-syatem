import { Role } from '@sms/shared';
import { PermissionModel } from '../models/Permission';
import { RoleModel } from '../models/Role';
import { PERMISSION_CATALOG } from './permissions.catalog';
import { ROLE_TEMPLATES } from './roleTemplates';

/**
 * Idempotent boot-time seeding: the permission catalogue (for admin UI
 * listing) and the platform-level SUPER_ADMIN system role. School-level
 * roles (SCHOOL_ADMIN, ACCOUNTANT, ...) are NOT seeded here — they're
 * created per-school on registration approval, see
 * modules/admin/registrations/registrations.service.ts.
 */
export async function ensurePermissionCatalog(): Promise<void> {
  await Promise.all(
    PERMISSION_CATALOG.map((entry) =>
      PermissionModel.updateOne({ code: entry.code }, { $setOnInsert: entry }, { upsert: true }),
    ),
  );
}

export async function ensureSuperAdminRole(): Promise<void> {
  await RoleModel.updateOne(
    { schoolId: null, name: Role.SUPER_ADMIN },
    {
      $setOnInsert: {
        schoolId: null,
        name: Role.SUPER_ADMIN,
        isSystem: true,
        permissions: ROLE_TEMPLATES[Role.SUPER_ADMIN],
        description: 'Platform super administrator — every permission, crosses tenant boundaries.',
      },
    },
    { upsert: true },
  );
}

export async function ensureRbacSeeded(): Promise<void> {
  await ensurePermissionCatalog();
  await ensureSuperAdminRole();
}
