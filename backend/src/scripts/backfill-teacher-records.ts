import 'dotenv/config';
import mongoose from 'mongoose';
import { Role } from '@sms/shared';
import { connectDB, disconnectDB } from '../db/connection';
import { RoleModel } from '../models/Role';
import { School } from '../models/School';
import { SchoolMembership } from '../models/SchoolMembership';
import { User } from '../models/User';
import { TenantContext } from '../tenant/context';
import { withTransaction } from '../utils/transaction';
import { ensureTeacherRecord } from '../modules/teachers/teachers.service';

/**
 * Gives a teacher record to every member who holds the TEACHER role but has
 * none — people given the role from Staff & roles before that started
 * creating one. Idempotent: anyone who already has a record is left alone.
 *
 * Run: npm run backfill:teachers   (from backend/)
 */
async function run(): Promise<void> {
  await connectDB();
  const schools = await TenantContext.runAsSystem(async () => School.find({ deletedAt: null }).select('_id name').lean());
  let created = 0;

  for (const school of schools) {
    const schoolId = String(school._id);
    const teacherRole = await RoleModel.findOne({ schoolId, name: Role.TEACHER, deletedAt: null }).select('_id').lean();
    if (!teacherRole) continue;
    const adminRole = await RoleModel.findOne({ schoolId, name: Role.SCHOOL_ADMIN, deletedAt: null }).select('_id').lean();

    // Act as the school (the tenant plugin scopes every write to it), recorded as the script.
    await TenantContext.run({ schoolId, userId: null, membershipId: null, role: Role.SCHOOL_ADMIN, isSuperAdmin: false }, async () => {
      // Audited as the school's first admin, the same stand-in the seed script uses.
      const admin = adminRole ? await SchoolMembership.findOne({ roleIds: adminRole._id, deletedAt: null }).sort({ createdAt: 1 }).select('userId').lean() : null;
      if (!admin) return;
      const actor = { actorUserId: String(admin.userId), schoolId, ip: 'backfill-teacher-records' };
      const members = await SchoolMembership.find({ roleIds: teacherRole._id, deletedAt: null, teacherId: null }).lean();

      for (const m of members) {
        const user = await User.findById(m.userId).select('firstName lastName email phone').lean();
        if (!user) continue;
        const outcome = await withTransaction((session) => ensureTeacherRecord(m._id, user, actor, session));
        if (outcome.created) {
          created += 1;
          // eslint-disable-next-line no-console
          console.log(`[backfill] ${school.name}: teacher record for ${user.email}`);
        }
      }
    });
  }
  // eslint-disable-next-line no-console
  console.log(`[backfill] done — ${created} teacher record(s) created.`);
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
