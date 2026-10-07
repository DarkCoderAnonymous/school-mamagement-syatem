import 'dotenv/config';
import mongoose from 'mongoose';
import { Role } from '@sms/shared';
import { connectDB, disconnectDB } from '../db/connection';
import { assertSafeSeedTarget } from './seed-guard';
import { TenantContext } from '../tenant/context';
import { ensureRbacSeeded } from '../rbac/seedRbac';
import { School } from '../models/School';
import { Plan } from '../models/Plan';
import { RoleModel } from '../models/Role';
import { User } from '../models/User';
import { SchoolMembership } from '../models/SchoolMembership';
import { SchoolRegistration } from '../models/SchoolRegistration';
import { hashPassword } from '../utils/password';
import { approveRegistration } from '../modules/admin/registrations/admin-registrations.service';
import { mailerQueue } from '../jobs/mailer.queue';
import { redis } from '../config/redis';
import { seedSchoolData, type DemoLogin } from './seed-school-data';

/**
 * Creates (or resets) a ready-to-use demo school with a School Admin account
 * whose password is fixed and known, so you can log straight into the web app
 * without going through the registration → approval → temp-password flow.
 *
 * It then fills the school with demo data (classes, subjects, teachers,
 * students and families, a principal and accountant, and a stocked store
 * room) — see seed-school-data.ts.
 *
 * Unlike the seed script this is idempotent and non-destructive: it wipes
 * nothing, re-running it resets the demo admin's password, and the demo data
 * is only added to a school that has no classes yet.
 *
 * Run: npm run seed:dummy-school   (from backend/)
 */
const DEMO_SCHOOL_NAME = 'Greenwood International School';
const DEMO_ADMIN_EMAIL = 'admin@greenwood.test';
const DEMO_ADMIN_PASSWORD = 'Admin@12345';
const DEMO_CONTACT_PERSON = 'Sara Malik';
const DEMO_PHONE = '+1-555-0142';

const SUPER_ADMIN_EMAIL = 'superadmin@sms.local';
const SUPER_ADMIN_PASSWORD = 'SuperAdmin123!';

/**
 * approveRegistration() stamps `createdBy`/audit entries with an actor, so a
 * SUPER_ADMIN must exist before a school can be provisioned. The seed script
 * normally creates it; create it here too so this script stands alone on a
 * fresh database.
 */
async function ensureSuperAdmin(): Promise<string> {
  const existing = await User.findOne({ email: SUPER_ADMIN_EMAIL });
  if (existing) return String(existing._id);

  const superAdminRole = await RoleModel.findOne({ schoolId: null, name: Role.SUPER_ADMIN });
  if (!superAdminRole) throw new Error('SUPER_ADMIN system role missing — ensureRbacSeeded must run first');

  const created = await User.create({
    email: SUPER_ADMIN_EMAIL,
    passwordHash: await hashPassword(SUPER_ADMIN_PASSWORD),
    firstName: 'Super',
    lastName: 'Admin',
    // Platform account: no membership anywhere (ADR-001).
    platformRoleIds: [superAdminRole._id],
    status: 'ACTIVE',
    mustChangePassword: false,
  });
  return String(created._id);
}

/** The demo school subscribes to whatever plan is available; create one if the DB has none. */
async function ensurePlanId(): Promise<mongoose.Types.ObjectId> {
  const existing = await Plan.findOne({ isActive: true }).sort({ priceMinor: 1 });
  if (existing) return existing._id;

  const created = await Plan.create({
    name: 'Demo Plan',
    code: 'DEMO',
    description: 'Plan created automatically for the demo school',
    priceMinor: 0,
    currency: 'USD',
    billingCycle: 'MONTHLY',
    limits: { students: 500, staff: 50, storageMb: 2048, smsCredits: 500 },
    enabledModules: ['students', 'attendance', 'exams', 'fees'],
    isActive: true,
  });
  return created._id;
}

/** Force the demo admin to a known password and clear the first-login password change. */
async function setKnownCredentials(userId: mongoose.Types.ObjectId | string): Promise<void> {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        passwordHash: await hashPassword(DEMO_ADMIN_PASSWORD),
        mustChangePassword: false,
        status: 'ACTIVE',
      },
    },
  );
}

async function run(): Promise<void> {
  // Before any connection: a non-local MONGO_URI stops here, untouched.
  assertSafeSeedTarget('seed:dummy-school');
  await connectDB();
  // The tenant plugin fails closed, so a script with no request has no
  // tenant context and every tenant-scoped query would throw. Scripts are
  // legitimately cross-tenant, so they declare it explicitly.
  await TenantContext.runAsSystem(async () => {
    await ensureRbacSeeded();

    const actorUserId = await ensureSuperAdmin();

    const existingAdmin = await User.findOne({ email: DEMO_ADMIN_EMAIL });
    if (existingAdmin) {
      await setKnownCredentials(existingAdmin._id);
      const membership = await SchoolMembership.findOne({ userId: existingAdmin._id, deletedAt: null }).lean();
      const school = membership ? await School.findById(membership.schoolId).lean() : null;
      const logins = membership ? await seedDemoData(String(membership._id)) : [];
      printCredentials(school?.name ?? DEMO_SCHOOL_NAME, 'password reset — account already existed', logins);
      return;
    }

    const planId = await ensurePlanId();

    // Go through the real registration → approval path rather than hand-building
    // the documents, so the demo school gets exactly what a genuine school gets:
    // School + Subscription + the six default Roles + a SCHOOL_ADMIN user, all in
    // one transaction.
    const registration = await SchoolRegistration.create({
      schoolName: DEMO_SCHOOL_NAME,
      contactPerson: DEMO_CONTACT_PERSON,
      email: DEMO_ADMIN_EMAIL,
      phone: DEMO_PHONE,
      address: '45 Greenwood Road',
      city: 'Springfield',
      country: 'USA',
      curriculum: 'International',
      expectedStudents: 400,
      requestedPlanId: planId,
      status: 'PENDING',
    });

    await approveRegistration(String(registration._id), { actorUserId });

    const adminUser = await User.findOne({ email: DEMO_ADMIN_EMAIL });
    if (!adminUser) throw new Error('School Admin user was not created by approveRegistration');
    await setKnownCredentials(adminUser._id);

    const membership = await SchoolMembership.findOne({ userId: adminUser._id, deletedAt: null }).lean();
    const logins = membership ? await seedDemoData(String(membership._id)) : [];
    printCredentials(DEMO_SCHOOL_NAME, 'created', logins);
  });
}

/** Runs the demo-data seed as the school's admin. Returns the extra demo logins, if it seeded. */
async function seedDemoData(membershipId: string): Promise<DemoLogin[]> {
  const membership = await SchoolMembership.findById(membershipId).lean();
  if (!membership) return [];
  const result = await seedSchoolData(
    {
      schoolId: String(membership.schoolId),
      adminUserId: String(membership.userId),
      membershipId,
    },
    DEMO_ADMIN_EMAIL.split('@')[1]!,
  );
  // eslint-disable-next-line no-console
  console.log(result.seeded ? '[demo] school data seeded' : '[demo] school already has data — left as is');
  return result.logins;
}

function printCredentials(schoolName: string, what: string, logins: DemoLogin[] = []): void {
  /* eslint-disable no-console */
  console.log('\n=== Demo school ready (%s) ===', what);
  console.log(`School:          ${schoolName}`);
  console.log(`School Admin:    ${DEMO_ADMIN_EMAIL}`);
  console.log(`Password:        ${DEMO_ADMIN_PASSWORD}`);
  for (const login of logins) console.log(`${`${login.role}:`.padEnd(17)}${login.email} / ${login.password}`);
  console.log(`Super Admin:     ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
  console.log('==============================\n');
  /* eslint-enable no-console */
}

run()
  .then(async () => {
    await disconnectDB();
    await mailerQueue.close();
    redis.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('[create-dummy-school] failed', err);
    await mongoose.disconnect();
    process.exit(1);
  });
