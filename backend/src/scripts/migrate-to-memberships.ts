import 'dotenv/config';
import mongoose, { Schema } from 'mongoose';
import { connectDB, disconnectDB } from '../db/connection';
import { TenantContext } from '../tenant/context';
import { User } from '../models/User';
import { SchoolMembership } from '../models/SchoolMembership';
import { RefreshToken } from '../models/RefreshToken';
import { generateOpaqueToken, sha256Hex } from '../utils/tokens';

/**
 * ADR-001 migration: one User row per school → one global User + one
 * SchoolMembership per school.
 *
 * Run with --dry-run first. It reports every action, including every merge,
 * and writes nothing.
 *
 *   npm run migrate:memberships -- --dry-run
 *   npm run migrate:memberships
 *
 * Idempotent: re-running skips users that already have a membership, so a
 * partial run can simply be repeated.
 */

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * The old shape, read directly from the `users` collection. The current User
 * model no longer declares `schoolId` or `roles`, so Mongoose would strip
 * them from a normal query — this legacy model exists purely to see the
 * fields we are migrating away from.
 */
interface LegacyUserDoc {
  _id: mongoose.Types.ObjectId;
  email: string;
  schoolId?: mongoose.Types.ObjectId | null;
  roles?: mongoose.Types.ObjectId[];
  createdAt: Date;
  passwordHash?: string;
}

const legacyUserSchema = new Schema(
  {
    email: String,
    schoolId: Schema.Types.ObjectId,
    roles: [Schema.Types.ObjectId],
    passwordHash: String,
  },
  { collection: 'users', strict: false, timestamps: true },
);

const LegacyUser =
  (mongoose.models.LegacyUser as mongoose.Model<LegacyUserDoc>) ??
  mongoose.model<LegacyUserDoc>('LegacyUser', legacyUserSchema);

/* eslint-disable no-console */
const log = (...args: unknown[]) => console.log(...args);

interface Stats {
  usersScanned: number;
  membershipsCreated: number;
  membershipsSkipped: number;
  identitiesMerged: number;
  platformAccounts: number;
}

/**
 * Step 3 of the ADR's migration, and the only genuinely lossy one.
 *
 * Two rows sharing an email are one person with two passwords, and nothing in
 * the data says which is theirs. Neither can be chosen safely: picking one
 * locks them out of the school whose password we discarded. So the oldest row
 * becomes the identity, every membership is repointed at it, and the merged
 * identity is forced through a password reset — a deliberate interruption for
 * a handful of accounts instead of a silent lockout.
 */
async function mergeGroup(rows: LegacyUserDoc[], stats: Stats): Promise<LegacyUserDoc> {
  const [keep, ...duplicates] = [...rows].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  log(
    `  MERGE ${keep!.email}: keeping ${keep!._id} (oldest), folding in ${duplicates
      .map((d) => String(d._id))
      .join(', ')}`,
  );
  log('         → password reset forced; both schools remain reachable');

  if (!DRY_RUN) {
    const resetToken = generateOpaqueToken();
    await User.updateOne(
      { _id: keep!._id },
      {
        $set: {
          mustChangePassword: true,
          passwordResetTokenHash: sha256Hex(resetToken),
          passwordResetExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          sessionsValidFrom: new Date(),
        },
      },
    );
    // Sessions belonging to the rows that are going away must not survive.
    for (const duplicate of duplicates) {
      await RefreshToken.updateMany(
        { userId: duplicate._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    }
  }

  stats.identitiesMerged += duplicates.length;
  return keep!;
}

async function run(): Promise<void> {
  await connectDB();

  await TenantContext.runAsSystem(async () => {
    const stats: Stats = {
      usersScanned: 0,
      membershipsCreated: 0,
      membershipsSkipped: 0,
      identitiesMerged: 0,
      platformAccounts: 0,
    };

    const legacyUsers = await LegacyUser.find({}).lean();
    stats.usersScanned = legacyUsers.length;

    log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Migrating ${legacyUsers.length} user row(s) to memberships\n`);

    // Group by email: a group larger than one is the same person at several
    // schools, which is exactly what this migration exists to unify.
    const byEmail = new Map<string, LegacyUserDoc[]>();
    for (const user of legacyUsers) {
      const key = (user.email ?? '').toLowerCase();
      byEmail.set(key, [...(byEmail.get(key) ?? []), user]);
    }

    for (const [email, rows] of byEmail) {
      const identity = rows.length > 1 ? await mergeGroup(rows, stats) : rows[0]!;

      for (const row of rows) {
        // A row with no schoolId is a platform account (SUPER_ADMIN): it gets
        // platform roles, never a membership.
        if (!row.schoolId) {
          stats.platformAccounts += 1;
          log(`  PLATFORM ${email}: no school — keeping ${row.roles?.length ?? 0} role(s) as platform roles`);
          if (!DRY_RUN && row.roles?.length) {
            await User.updateOne({ _id: identity._id }, { $set: { platformRoleIds: row.roles } });
          }
          continue;
        }

        const existing = await SchoolMembership.findOne({
          userId: identity._id,
          schoolId: row.schoolId,
          deletedAt: null,
        }).lean();

        if (existing) {
          stats.membershipsSkipped += 1;
          log(`  SKIP ${email} @ ${row.schoolId}: membership already exists`);
          continue;
        }

        log(`  CREATE membership ${email} @ ${row.schoolId} with ${row.roles?.length ?? 0} role(s)`);
        if (!DRY_RUN) {
          await SchoolMembership.create({
            userId: identity._id,
            schoolId: row.schoolId,
            roleIds: row.roles ?? [],
            status: 'ACTIVE',
            permissionsEpoch: 0,
          });
        }
        stats.membershipsCreated += 1;
      }

      // Rows folded into another identity are removed only after their
      // memberships have been created against the surviving identity.
      if (rows.length > 1 && !DRY_RUN) {
        const duplicateIds = rows.filter((r) => String(r._id) !== String(identity._id)).map((r) => r._id);
        await LegacyUser.deleteMany({ _id: { $in: duplicateIds } });
      }
    }

    log('\n--- Summary ---');
    log(`User rows scanned:     ${stats.usersScanned}`);
    log(`Memberships created:   ${stats.membershipsCreated}`);
    log(`Memberships skipped:   ${stats.membershipsSkipped} (already present)`);
    log(`Identities merged:     ${stats.identitiesMerged} duplicate row(s) folded in`);
    log(`Platform accounts:     ${stats.platformAccounts}`);
    log(DRY_RUN ? '\nDRY RUN — nothing was written. Re-run without --dry-run to apply.\n' : '\nDone.\n');

    if (!DRY_RUN && stats.identitiesMerged > 0) {
      log('NOTE: merged identities must reset their password before signing in again.');
    }
  });
}

run()
  .then(async () => {
    await disconnectDB();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[migrate-to-memberships] failed', err);
    await mongoose.disconnect();
    process.exit(1);
  });
/* eslint-enable no-console */
