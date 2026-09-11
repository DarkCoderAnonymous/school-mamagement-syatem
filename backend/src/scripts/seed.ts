import 'dotenv/config';
import mongoose from 'mongoose';
import { Role } from '@sms/shared';
import { connectDB, disconnectDB } from '../db/connection';
import { TenantContext } from '../tenant/context';
import { ensureRbacSeeded } from '../rbac/seedRbac';
import { School } from '../models/School';
import { Plan } from '../models/Plan';
import { Subscription } from '../models/Subscription';
import { SchoolRegistration } from '../models/SchoolRegistration';
import { RoleModel } from '../models/Role';
import { User } from '../models/User';
import { SchoolMembership } from '../models/SchoolMembership';
import { RefreshToken } from '../models/RefreshToken';
import { AuditLog } from '../models/AuditLog';
import { hashPassword } from '../utils/password';
import { approveRegistration } from '../modules/admin/registrations/admin-registrations.service';

const SUPER_ADMIN_EMAIL = 'superadmin@sms.local';
const SUPER_ADMIN_PASSWORD = 'SuperAdmin123!';

async function wipeSliceOneData(): Promise<void> {
  await Promise.all([
    School.deleteMany({}),
    SchoolRegistration.deleteMany({}),
    Subscription.deleteMany({}),
    User.deleteMany({}),
    SchoolMembership.deleteMany({}),
    RoleModel.deleteMany({ schoolId: { $ne: null } }),
    RefreshToken.deleteMany({}),
    AuditLog.deleteMany({}),
    Plan.deleteMany({}),
  ]);
}

async function seedPlans() {
  return Plan.create([
    {
      name: 'Free Trial',
      code: 'TRIAL',
      description: 'Try the platform free for 1 week, no card required',
      priceMinor: 0,
      currency: 'USD',
      billingCycle: 'WEEKLY',
      limits: { students: 50, staff: 10, storageMb: 512, smsCredits: 50 },
      enabledModules: ['students', 'attendance', 'exams', 'fees'],
      isActive: true,
    },
    {
      name: 'Starter',
      code: 'STARTER',
      description: 'For small schools just getting started',
      priceMinor: 4900,
      currency: 'USD',
      billingCycle: 'MONTHLY',
      limits: { students: 200, staff: 20, storageMb: 2048, smsCredits: 500 },
      enabledModules: ['students', 'attendance', 'exams', 'fees'],
      isActive: true,
    },
    {
      name: 'Growth',
      code: 'GROWTH',
      description: 'For growing schools with multiple campuses',
      priceMinor: 14900,
      currency: 'USD',
      billingCycle: 'MONTHLY',
      limits: { students: 1000, staff: 100, storageMb: 10240, smsCredits: 2000 },
      enabledModules: ['students', 'attendance', 'exams', 'fees', 'payroll'],
      isActive: true,
    },
    {
      name: 'Enterprise',
      code: 'ENTERPRISE',
      description: 'For large school groups',
      priceMinor: 49900,
      currency: 'USD',
      billingCycle: 'ANNUAL',
      limits: { students: 10000, staff: 1000, storageMb: 102400, smsCredits: 20000 },
      enabledModules: ['students', 'attendance', 'exams', 'fees', 'payroll', 'timetable'],
      isActive: true,
    },
  ]);
}

async function seedSuperAdmin() {
  const superAdminRole = await RoleModel.findOne({ schoolId: null, name: Role.SUPER_ADMIN });
  if (!superAdminRole) throw new Error('SUPER_ADMIN system role missing — ensureRbacSeeded must run first');

  return User.create({
    email: SUPER_ADMIN_EMAIL,
    passwordHash: await hashPassword(SUPER_ADMIN_PASSWORD),
    firstName: 'Super',
    lastName: 'Admin',
    // Platform account: belongs to no school, so it holds a platform role
    // rather than a membership (ADR-001).
    platformRoleIds: [superAdminRole._id],
    status: 'ACTIVE',
    mustChangePassword: false,
  });
}

async function run(): Promise<void> {
  await connectDB();
  // The tenant plugin fails closed, so a script with no request has no
  // tenant context and every tenant-scoped query would throw. Scripts are
  // legitimately cross-tenant, so they declare it explicitly.
  await TenantContext.runAsSystem(async () => {
    await wipeSliceOneData();
    await ensureRbacSeeded();

    const superAdmin = await seedSuperAdmin();
    const [, starterPlan, growthPlan] = await seedPlans();

    const pendingRegistration = await SchoolRegistration.create({
      schoolName: 'Riverside Public School',
      contactPerson: 'Amara Okafor',
      email: 'admissions@riverside.example',
      phone: '+1-555-0100',
      address: '12 Riverside Ave',
      city: 'Springfield',
      country: 'USA',
      curriculum: 'National',
      expectedStudents: 350,
      requestedPlanId: growthPlan!._id,
      status: 'PENDING',
    });

    const approvedRegistration = await SchoolRegistration.create({
      schoolName: 'Lakeside Academy',
      contactPerson: 'Daniel Reyes',
      email: 'admin@lakeside.example',
      phone: '+1-555-0200',
      address: '88 Lakeside Dr',
      city: 'Fairview',
      country: 'USA',
      curriculum: 'International',
      expectedStudents: 600,
      requestedPlanId: starterPlan!._id,
      status: 'PENDING',
    });

    const approvalResult = await approveRegistration(String(approvedRegistration._id), {
      actorUserId: String(superAdmin._id),
    });

    // eslint-disable-next-line no-console
    console.log('\n=== Seed complete ===');
    // eslint-disable-next-line no-console
    console.log(`Super Admin login:      ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
    // eslint-disable-next-line no-console
    console.log(
      `Sample School Admin:    ${approvalResult.adminEmail} / ${approvalResult.tempPassword ?? '(existing account password)'} (must change on first login)`,
    );
    // eslint-disable-next-line no-console
    console.log(`Pending registration:   ${pendingRegistration.schoolName} (${pendingRegistration.status})`);
    // eslint-disable-next-line no-console
    console.log('======================\n');
  });
}

run()
  .then(async () => {
    await disconnectDB();
    process.exit(0);
  })
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed', err);
    await mongoose.disconnect();
    process.exit(1);
  });
