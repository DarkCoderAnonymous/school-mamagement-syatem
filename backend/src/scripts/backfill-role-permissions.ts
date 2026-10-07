import 'dotenv/config';
import mongoose from 'mongoose';
import { Role } from '@sms/shared';
import { connectDB, disconnectDB } from '../db/connection';
import { ensureRbacSeeded } from '../rbac/seedRbac';
import { RoleModel } from '../models/Role';
import { School } from '../models/School';
import { REVOKED_FROM_TEMPLATES, ROLE_TEMPLATES, SCHOOL_DEFAULT_ROLES } from '../rbac/roleTemplates';
import { TenantContext } from '../tenant/context';
import { bumpEpochForRole } from '../services/auth-freshness.service';

/**
 * Grants newly-added template permissions to roles that were seeded before
 * those permissions existed.
 *
 * Roles are created per-school at approval time and `ensureRbacSeeded` uses
 * `$setOnInsert`, so adding a permission to ROLE_TEMPLATES reaches new schools
 * only — every existing school keeps the set it was provisioned with, and its
 * admins silently can't see the new screens. This script closes that gap.
 *
 * It also creates any default role a school is missing entirely — a role added
 * to SCHOOL_DEFAULT_ROLES (e.g. PRINCIPAL) after the school was approved.
 *
 * It is purely ADDITIVE and only touches `isSystem` roles: permissions a
 * school removed by hand come back (they are part of the role's definition
 * again), but custom roles a school created are never modified, and nothing
 * is ever revoked.
 *
 * Run: npm run backfill:permissions   (from backend/)
 */
async function run(): Promise<void> {
  await connectDB();
  // Roles are platform-level but memberships are tenant-owned, and this
  // script legitimately crosses every school.
  await TenantContext.runAsSystem(async () => {
    await ensureRbacSeeded();

    // The Role name index became partial (deletedAt: null) so a deleted custom
    // role's name can be reused. MongoDB keeps an existing index's old spec
    // until it is rebuilt, and Role is small, so rebuild it here.
    await RoleModel.syncIndexes();

    // Default roles a school was provisioned without. Nobody holds a new role
    // yet, so there are no epochs to bump for these.
    const schools = await School.find({ deletedAt: null }).select('_id name').lean();
    let rolesCreated = 0;
    for (const school of schools) {
      const existing = await RoleModel.find({ schoolId: school._id }).select('name').lean();
      const have = new Set(existing.map((r) => r.name));
      for (const name of SCHOOL_DEFAULT_ROLES.filter((n) => !have.has(n))) {
        await RoleModel.create({
          schoolId: school._id,
          name,
          isSystem: true,
          permissions: ROLE_TEMPLATES[name],
        });
        rolesCreated += 1;
        // eslint-disable-next-line no-console
        console.log(`[backfill] created ${name} role for ${school.name}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[backfill] ${rolesCreated} missing default role(s) created.`);

    // Security revocations first: permissions a system role must no longer hold.
    let revoked = 0;
    for (const [roleName, remove] of Object.entries(REVOKED_FROM_TEMPLATES)) {
      if (!remove?.length) continue;
      const affected = await RoleModel.find({ isSystem: true, name: roleName, permissions: { $in: remove } });
      for (const role of affected) {
        const dropping = role.permissions.filter((p) => (remove as string[]).includes(p));
        await RoleModel.updateOne({ _id: role._id }, { $pullAll: { permissions: remove } });
        // Revoking must reach live tokens too, not wait for their 15-minute expiry (ADR-005).
        await bumpEpochForRole(String(role._id));
        revoked += 1;
        // eslint-disable-next-line no-console
        console.log(`[backfill] REVOKED from ${role.name} (school ${role.schoolId ?? 'platform'}): ${dropping.join(', ')}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[backfill] ${revoked} role(s) had revoked permissions removed.`);

    const roles = await RoleModel.find({ isSystem: true });
    let updated = 0;
    let unchanged = 0;
    let epochsBumped = 0;

    for (const role of roles) {
      const template = ROLE_TEMPLATES[role.name as Role];
      if (!template) continue;

      const current = new Set(role.permissions);
      const missing = template.filter((p) => !current.has(p));
      if (missing.length === 0) {
        unchanged += 1;
        continue;
      }

      await RoleModel.updateOne(
        { _id: role._id },
        { $addToSet: { permissions: { $each: missing } } },
      );

      /**
       * Editing a role changes what every membership holding it may do, so each
       * one's permission epoch must move (ADR-005). Without this the new
       * permissions would sit in the database while live tokens kept the old
       * set — which is exactly the "sign out and back in" instruction this
       * mechanism exists to retire.
       */
      const affected = await bumpEpochForRole(String(role._id));
      epochsBumped += affected;

      updated += 1;
      // eslint-disable-next-line no-console
      console.log(
        `[backfill] ${role.name} (school ${role.schoolId ?? 'platform'}): +${missing.length} → ${missing.join(', ')}`,
      );
    }

    // eslint-disable-next-line no-console
    console.log(`\n[backfill] done — ${updated} role(s) updated, ${unchanged} already current.`);
    // eslint-disable-next-line no-console
    console.log(
      `[backfill] ${epochsBumped} membership epoch(s) bumped — affected sessions pick the`,
    );
    // eslint-disable-next-line no-console
    console.log(
      '[backfill] new permissions up on their next request, with no sign-out required.\n',
    );
  });
}

run()
  .then(async () => {
    await disconnectDB();
    process.exit(0);
  })
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('[backfill] failed', err);
    await mongoose.disconnect();
    process.exit(1);
  });
