import request from 'supertest';
import { Role } from '@sms/shared';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/db/connection';
import { ensureRbacSeeded } from '../src/rbac/seedRbac';
import { Plan } from '../src/models/Plan';
import { School } from '../src/models/School';
import { Subscription } from '../src/models/Subscription';
import { RoleModel } from '../src/models/Role';
import { User } from '../src/models/User';
import { SchoolMembership } from '../src/models/SchoolMembership';
import { hashPassword } from '../src/utils/password';
import { TenantContext } from '../src/tenant/context';
import { asSystem } from './helpers/as-system';
import { redis } from '../src/config/redis';
import { enqueueMail, mailerQueue } from '../src/jobs/mailer.queue';

const app = createApp();

let planId: string;
let superAdminToken: string;
let registrationCounter = 0;

function uniqueRegistrationPayload(overrides: Record<string, unknown> = {}) {
  registrationCounter += 1;
  return {
    schoolName: `Test School ${registrationCounter}`,
    contactPerson: 'Jamie Founder',
    email: `founder-${registrationCounter}@example.com`,
    phone: '+1-555-0000',
    requestedPlanId: planId,
    ...overrides,
  };
}

async function submitAndApprove(overrides: Record<string, unknown> = {}) {
  const payload = uniqueRegistrationPayload(overrides);
  const submitRes = await request(app).post('/api/v1/registrations').send(payload).expect(201);
  const registrationId = submitRes.body.data.id as string;

  const approveRes = await request(app)
    .post(`/api/v1/admin/registrations/${registrationId}/approve`)
    .set('Authorization', `Bearer ${superAdminToken}`)
    .expect(200);

  return { registrationId, payload, ...approveRes.body.data };
}

beforeAll(async () => {
  await connectDB();
  await ensureRbacSeeded();

  const plan = await Plan.create({
    name: 'Test Plan',
    code: 'TESTPLAN',
    priceMinor: 1000,
    limits: { students: 10, staff: 5 },
  });
  planId = String(plan._id);

  const superAdminRole = await RoleModel.findOne({ schoolId: null, name: Role.SUPER_ADMIN });
  await asSystem(async () =>
    User.create({
      email: 'super@test.local',
      passwordHash: await hashPassword('SuperPass123!'),
      firstName: 'Super',
      lastName: 'Admin',
      // Platform account: no membership anywhere (ADR-001).
      platformRoleIds: [superAdminRole!._id],
      status: 'ACTIVE',
    }),
  );

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'super@test.local', password: 'SuperPass123!' })
    .expect(200);
  superAdminToken = loginRes.body.data.accessToken;
});

afterAll(async () => {
  await disconnectDB();
  await mailerQueue.close();
  redis.disconnect();
});

describe('Slice 1: registration -> approval -> login', () => {
  it('submits a school registration application', async () => {
    const payload = uniqueRegistrationPayload();
    const res = await request(app).post('/api/v1/registrations').send(payload).expect(201);
    expect(res.body.data.status).toBe('PENDING');

    const statusRes = await request(app)
      .get(`/api/v1/registrations/status?email=${payload.email}`)
      .expect(200);
    expect(statusRes.body.data.status).toBe('PENDING');
  });

  it('approves a registration atomically, provisioning School + Subscription + Roles + admin User', async () => {
    const { school, adminEmail, tempPassword, payload } = await submitAndApprove();

    const schoolDoc = await School.findById(school._id).lean();
    expect(schoolDoc?.status).toBe('ACTIVE');
    expect(schoolDoc?.name).toBe(payload.schoolName);

    const subscription = await Subscription.findOne({ schoolId: school._id }).lean();
    expect(subscription?.planId.toString()).toBe(planId);

    const roles = await RoleModel.find({ schoolId: school._id }).lean();
    expect(roles.map((r) => r.name).sort()).toEqual(
      [Role.SCHOOL_ADMIN, Role.ACCOUNTANT, Role.EXAM_CONTROLLER, Role.TEACHER, Role.PARENT, Role.STUDENT].sort(),
    );

    const adminUser = await asSystem(() => User.findOne({ email: adminEmail }).lean());
    expect(adminUser?.mustChangePassword).toBe(true);
    expect(typeof tempPassword).toBe('string');

    // Tenancy lives on the membership now, not on the user (ADR-001).
    const membership = await asSystem(() =>
      SchoolMembership.findOne({ userId: adminUser!._id, schoolId: school._id }).lean(),
    );
    expect(membership).not.toBeNull();
    expect(membership!.status).toBe('ACTIVE');
    expect(membership!.roleIds).toHaveLength(1);
  });

  it('rejects approving the same registration twice', async () => {
    const payload = uniqueRegistrationPayload();
    const submitRes = await request(app).post('/api/v1/registrations').send(payload).expect(201);
    const registrationId = submitRes.body.data.id as string;

    await request(app)
      .post(`/api/v1/admin/registrations/${registrationId}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    const second = await request(app)
      .post(`/api/v1/admin/registrations/${registrationId}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(second.status).toBe(409);
  });

  it('logs in successfully with the temporary password and flags mustChangePassword', async () => {
    const { adminEmail, tempPassword } = await submitAndApprove();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: tempPassword })
      .expect(200);

    expect(res.body.data.user.mustChangePassword).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('blocks login when the school has been suspended', async () => {
    const { school, adminEmail, tempPassword } = await submitAndApprove();

    await request(app)
      .patch(`/api/v1/admin/schools/${school._id}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'SUSPENDED' })
      .expect(200);

    const res = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password: tempPassword });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SCHOOL_SUSPENDED');
  });

  it('rotates the refresh token and rejects reuse of an already-rotated token', async () => {
    const { adminEmail, tempPassword } = await submitAndApprove();
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: tempPassword })
      .expect(200);
    const originalRefreshToken = loginRes.body.data.refreshToken as string;

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefreshToken })
      .expect(200);
    expect(refreshRes.body.data.refreshToken).not.toBe(originalRefreshToken);

    const reuseRes = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: originalRefreshToken });
    expect(reuseRes.status).toBe(401);
  });

  it('keeps tenant data isolated between schools, including through aggregate pipelines', async () => {
    const schoolA = await submitAndApprove();
    const schoolB = await submitAndApprove();

    const userA = await asSystem(() => User.findOne({ email: schoolA.adminEmail }).lean());
    const userB = await asSystem(() => User.findOne({ email: schoolB.adminEmail }).lean());

    await TenantContext.run(
      { schoolId: String(schoolA.school._id), userId: String(userA!._id), role: Role.SCHOOL_ADMIN, isSuperAdmin: false },
      async () => {
        // User is global now; SchoolMembership is the tenant-owned record,
        // so it is what must never cross schools.
        const memberships = await SchoolMembership.find({}).lean();
        expect(memberships.length).toBeGreaterThan(0);
        expect(memberships.every((m) => String(m.schoolId) === String(schoolA.school._id))).toBe(true);
        expect(memberships.some((m) => String(m.userId) === String(userB!._id))).toBe(false);

        const agg = await SchoolMembership.aggregate([
          { $group: { _id: '$schoolId', count: { $sum: 1 } } },
        ]);
        expect(agg).toHaveLength(1);
        expect(String(agg[0]._id)).toBe(String(schoolA.school._id));
      },
    );
  });

  it('ignores a caller-supplied schoolId that points at another school', async () => {
    const schoolA = await submitAndApprove();
    const schoolB = await submitAndApprove();

    const userA = await asSystem(() => User.findOne({ email: schoolA.adminEmail }).lean());
    const userB = await asSystem(() => User.findOne({ email: schoolB.adminEmail }).lean());

    await TenantContext.run(
      { schoolId: String(schoolA.school._id), userId: String(userA!._id), role: Role.SCHOOL_ADMIN, isSuperAdmin: false },
      async () => {
        // Asking for school B explicitly must not widen the query past school A,
        // whether by filter, by id, or by write.
        const leaked = await SchoolMembership.find({ schoolId: schoolB.school._id }).lean();
        expect(leaked.every((m) => String(m.schoolId) === String(schoolA.school._id))).toBe(true);

        const leakedOne = await SchoolMembership.findOne({
          userId: userB!._id,
          schoolId: schoolB.school._id,
        }).lean();
        expect(leakedOne).toBeNull();

        const countedAcross = await SchoolMembership.countDocuments({ schoolId: schoolB.school._id });
        expect(countedAcross).toBe(await SchoolMembership.countDocuments({}));

        const crossWrite = await SchoolMembership.updateOne(
          { userId: userB!._id, schoolId: schoolB.school._id },
          { $set: { status: 'DISABLED' } },
        );
        expect(crossWrite.matchedCount).toBe(0);
      },
    );

    const untouched = await asSystem(() =>
      SchoolMembership.findOne({ userId: userB!._id, schoolId: schoolB.school._id }).lean(),
    );
    expect(untouched!.status).toBe('ACTIVE');
  });
});

/**
 * The suite runs against an unreachable Redis on purpose (see
 * test/set-env.ts). Every test above therefore already proves that login and
 * school approval survive a Redis outage; these two pin down the specific
 * behaviour that used to break, where the request hung indefinitely instead
 * of degrading.
 */
describe('Redis outage resilience', () => {
  it('gives up enqueuing mail instead of hanging the caller', async () => {
    const startedAt = Date.now();

    await expect(enqueueMail({ to: 'nobody@example.com', subject: 'ping', body: 'ping' })).resolves.toBeUndefined();

    // The point is that it settles at all; the bound just keeps the failure fast.
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  });

  it('still lets a valid login through when the rate-limiter store is unreachable', async () => {
    const { adminEmail, tempPassword } = await submitAndApprove();

    await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password: tempPassword }).expect(200);
  });
});
