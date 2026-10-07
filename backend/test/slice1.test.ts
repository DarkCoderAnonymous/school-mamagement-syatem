import request from 'supertest';
import { Role } from '@sms/shared';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/db/connection';
import { ensureRbacSeeded } from '../src/rbac/seedRbac';
import { Plan } from '../src/models/Plan';
import { School } from '../src/models/School';
import { Subscription } from '../src/models/Subscription';
import { RoleModel } from '../src/models/Role';
import { AuditLog } from '../src/models/AuditLog';
import { User } from '../src/models/User';
import { SchoolMembership } from '../src/models/SchoolMembership';
import { hashPassword } from '../src/utils/password';
import { TenantContext } from '../src/tenant/context';
import { asSystem } from './helpers/as-system';
import { redis } from '../src/config/redis';
import { enqueueMail, mailerQueue } from '../src/jobs/mailer.queue';
import { invalidateSchoolAccess } from '../src/services/auth-freshness.service';

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
      [Role.SCHOOL_ADMIN, Role.PRINCIPAL, Role.ACCOUNTANT, Role.EXAM_CONTROLLER, Role.TEACHER, Role.PARENT, Role.STUDENT].sort(),
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

  it('runs the school in the currency chosen at registration', async () => {
    const { school, adminEmail, tempPassword } = await submitAndApprove({ currency: 'PKR' });
    expect(school.currency).toBe('PKR');
    const stored = await School.findById(school._id).lean();
    expect(stored?.currency).toBe('PKR');

    const login = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password: tempPassword }).expect(200);
    expect(login.body.data.user.schoolCurrency).toBe('PKR');
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.data.accessToken}`).expect(200);
    expect(me.body.data.schoolCurrency).toBe('PKR');
  });

  it('defaults the currency for older clients and refuses one it cannot handle', async () => {
    const { school } = await submitAndApprove();
    expect(school.currency).toBe('USD');

    // Not a currency, and a three-decimal one the minor-unit maths can't represent.
    for (const currency of ['XYZ', 'KWD']) {
      const res = await request(app).post('/api/v1/registrations').send(uniqueRegistrationPayload({ currency })).expect(400);
      expect(JSON.stringify(res.body.error.details)).toContain('currency');
    }
  });

  it("lets a school admin pick their own school's palette, and only theirs", async () => {
    const a = await submitAndApprove();
    const b = await submitAndApprove();
    // A temporary-password session only reaches /auth (L4), so — like every
    // other suite's fixture — clear the first-login flag before using the API.
    const signIn = async (email: string, password: string) => {
      await asSystem(() => User.updateOne({ email }, { $set: { mustChangePassword: false } }));
      return (await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200)).body.data.accessToken as string;
    };
    const tokenA = await signIn(a.adminEmail, a.tempPassword);
    const tokenB = await signIn(b.adminEmail, b.tempPassword);
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const before = await request(app).get('/api/v1/school-settings').set(auth(tokenA)).expect(200);
    expect(before.body.data).toMatchObject({ theme: 'blue', currency: 'USD' });

    const saved = await request(app).patch('/api/v1/school-settings').set(auth(tokenA)).send({ theme: 'emerald' }).expect(200);
    expect(saved.body.data).toMatchObject({ theme: 'emerald', primaryColor: '#01614d' });
    const me = await request(app).get('/api/v1/auth/me').set(auth(tokenA)).expect(200);
    expect(me.body.data).toMatchObject({ schoolTheme: 'emerald', schoolPrimaryColor: '#01614d' });

    // The other school is untouched, and there is no way to name it.
    const other = await request(app).get('/api/v1/auth/me').set(auth(tokenB)).expect(200);
    expect(other.body.data.schoolTheme).toBe('blue');
    await request(app).patch('/api/v1/school-settings').set(auth(tokenA)).send({ theme: 'teal', schoolId: b.school._id }).expect(400);
    await request(app).patch('/api/v1/school-settings').set(auth(tokenA)).send({ theme: 'neon-green' }).expect(400);

    const audit = await AuditLog.findOne({ action: 'school.settings.update', entityId: a.school._id }).lean();
    expect(audit?.after).toMatchObject({ theme: 'emerald' });
  });

  it('keeps the platform console away from school accounts', async () => {
    const { school, adminEmail, tempPassword } = await submitAndApprove();
    const login = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password: tempPassword }).expect(200);
    const auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
    // A school admin holds `school.read` for their own school — which must not open every school.
    await request(app).get('/api/v1/admin/schools').set(auth).expect(403);
    await request(app).get(`/api/v1/admin/schools/${school._id}`).set(auth).expect(403);
    await request(app).get('/api/v1/admin/registrations').set(auth).expect(403);
    await request(app).get('/api/v1/admin/plans').set(auth).expect(403);
    // The super admin still has all of it.
    await request(app).get('/api/v1/admin/schools').set('Authorization', `Bearer ${superAdminToken}`).expect(200);
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

  it('ends sessions already signed in when the school is suspended, and restores them on reactivation', async () => {
    const { school, adminEmail, tempPassword } = await submitAndApprove();
    const login = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password: tempPassword }).expect(200);
    const { accessToken, refreshToken } = login.body.data as { accessToken: string; refreshToken: string };
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);

    const setStatus = (status: string) =>
      request(app).patch(`/api/v1/admin/schools/${school._id}/status`).set('Authorization', `Bearer ${superAdminToken}`).send({ status }).expect(200);
    await setStatus('SUSPENDED');

    // The very next request is refused with a 401, so clients try a refresh…
    const blocked = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('SCHOOL_SUSPENDED');
    // …which refuses too, and the client signs them out.
    const refused = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('SCHOOL_SUSPENDED');

    // The super admin is never caught by a school's suspension.
    await request(app).get('/api/v1/admin/schools').set('Authorization', `Bearer ${superAdminToken}`).expect(200);

    // Reactivating lets the same session straight back in.
    await setStatus('ACTIVE');
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken }).expect(200);
  });

  it('ends sessions when the school subscription is no longer active', async () => {
    const { school, adminEmail, tempPassword } = await submitAndApprove();
    const login = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password: tempPassword }).expect(200);
    const { accessToken, refreshToken } = login.body.data as { accessToken: string; refreshToken: string };

    await Subscription.updateMany({ schoolId: school._id }, { $set: { status: 'CANCELLED' } });
    invalidateSchoolAccess(String(school._id));

    const blocked = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('SUBSCRIPTION_INACTIVE');
    const refused = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('SUBSCRIPTION_INACTIVE');
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
