import request from 'supertest';
import { Role } from '@sms/shared';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/db/connection';
import { ensureRbacSeeded } from '../src/rbac/seedRbac';
import { Plan } from '../src/models/Plan';
import { RoleModel } from '../src/models/Role';
import { User } from '../src/models/User';
import { SchoolMembership } from '../src/models/SchoolMembership';
import { AcademicSession } from '../src/models/AcademicSession';
import { AuditLog } from '../src/models/AuditLog';
import { hashPassword } from '../src/utils/password';
import { redis } from '../src/config/redis';
import { mailerQueue } from '../src/jobs/mailer.queue';
import { asSystem } from './helpers/as-system';

const app = createApp();

let superAdminToken: string;
let schoolAToken: string;
let schoolBToken: string;
let schoolAId: string;
let teacherToken: string;
let counter = 0;

/** Provisions a school through the real approval flow and logs its admin in. */
async function provisionSchool(planId: string) {
  counter += 1;
  const email = `admin-${counter}@sessions.test`;
  const submitRes = await request(app)
    .post('/api/v1/registrations')
    .send({
      schoolName: `Sessions School ${counter}`,
      contactPerson: 'Admin Person',
      email,
      phone: '+1-555-0101',
      requestedPlanId: planId,
    })
    .expect(201);

  const approveRes = await request(app)
    .post(`/api/v1/admin/registrations/${submitRes.body.data.id}/approve`)
    .set('Authorization', `Bearer ${superAdminToken}`)
    .expect(200);

  const { adminEmail, tempPassword, school } = approveRes.body.data;
  // The approval flow forces a password change on first login; clear it so
  // the test can go straight to the API under test.
  await asSystem(() => User.updateOne({ email: adminEmail }, { $set: { mustChangePassword: false } }));

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: adminEmail, password: tempPassword })
    .expect(200);

  return { token: loginRes.body.data.accessToken as string, schoolId: String(school._id), adminEmail };
}

const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: `2025-2026 #${counter}`,
  startDate: '2025-04-01T00:00:00.000Z',
  endDate: '2026-03-31T00:00:00.000Z',
  ...overrides,
});

beforeAll(async () => {
  await connectDB();
  await ensureRbacSeeded();

  const plan = await Plan.create({
    name: 'Sessions Plan',
    code: 'SESSIONPLAN',
    priceMinor: 1000,
    limits: { students: 50, staff: 10 },
  });

  const superAdminRole = await RoleModel.findOne({ schoolId: null, name: Role.SUPER_ADMIN });
  await asSystem(async () =>
    User.create({
      email: 'super@sessions.test',
      passwordHash: await hashPassword('SuperPass123!'),
      firstName: 'Super',
      lastName: 'Admin',
      // Platform account: no membership anywhere (ADR-001).
      platformRoleIds: [superAdminRole!._id],
      status: 'ACTIVE',
    }),
  );
  const superLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'super@sessions.test', password: 'SuperPass123!' })
    .expect(200);
  superAdminToken = superLogin.body.data.accessToken;

  const schoolA = await provisionSchool(String(plan._id));
  schoolAToken = schoolA.token;
  schoolAId = schoolA.schoolId;

  const schoolB = await provisionSchool(String(plan._id));
  schoolBToken = schoolB.token;

  // A teacher in school A: holds session.read but not session.create, which is
  // what proves the guards check permissions rather than roles.
  const teacherRole = await RoleModel.findOne({ schoolId: schoolAId, name: Role.TEACHER });
  await asSystem(async () => {
    const teacherUser = await User.create({
      email: 'teacher@sessions.test',
      passwordHash: await hashPassword('TeachPass123!'),
      firstName: 'Tara',
      lastName: 'Teacher',
      status: 'ACTIVE',
    });
    // Roles live on the membership now, not the user (ADR-001).
    return SchoolMembership.create({
      userId: teacherUser._id,
      schoolId: schoolAId,
      roleIds: [teacherRole!._id],
      status: 'ACTIVE',
    });
  });
  const teacherLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'teacher@sessions.test', password: 'TeachPass123!' })
    .expect(200);
  teacherToken = teacherLogin.body.data.accessToken;
});

afterAll(async () => {
  await disconnectDB();
  await mailerQueue.close();
  redis.disconnect();
});

describe('Academic sessions', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/v1/academic-sessions').expect(401);
  });

  it('creates a session and stamps schoolId from the token, not the body', async () => {
    const res = await request(app)
      .post('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${schoolAToken}`)
      // A forged schoolId must not win — the tenant plugin overrides it.
      .send(validBody({ name: 'Tenant Stamp Test', schoolId: '0'.repeat(24) }))
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.schoolId).toBe(schoolAId);
  });

  it('rejects an end date that is not after the start date', async () => {
    const res = await request(app)
      .post('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send(validBody({ name: 'Bad range', startDate: '2026-01-01', endDate: '2025-01-01' }))
      .expect(400);

    expect(res.body.success).toBe(false);
    // validate.middleware maps a Zod failure to AppError.badRequest.
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects a duplicate session name within the same school', async () => {
    const body = validBody({ name: 'Duplicate Year' });
    await request(app)
      .post('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send(body)
      .expect(201);

    const res = await request(app)
      .post('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send(body)
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('allows the same session name in a different school', async () => {
    await request(app)
      .post('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${schoolBToken}`)
      .send(validBody({ name: 'Duplicate Year' }))
      .expect(201);
  });

  it('never lists another school\'s sessions', async () => {
    const res = await request(app)
      .get('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${schoolBToken}`)
      .expect(200);

    const names = res.body.data.items.map((s: { name: string }) => s.name);
    expect(names).toContain('Duplicate Year');
    expect(names).not.toContain('Tenant Stamp Test');
    for (const item of res.body.data.items) expect(item.schoolId).not.toBe(schoolAId);
  });

  it("404s rather than leaking when fetching another school's session by id", async () => {
    const created = await request(app)
      .post('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send(validBody({ name: 'Private To A' }))
      .expect(201);

    await request(app)
      .get(`/api/v1/academic-sessions/${created.body.data._id}`)
      .set('Authorization', `Bearer ${schoolBToken}`)
      .expect(404);
  });

  it('keeps exactly one current session per school', async () => {
    const first = await request(app)
      .post('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send(validBody({ name: 'Current One', isCurrent: true }))
      .expect(201);

    const second = await request(app)
      .post('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send(validBody({ name: 'Current Two', isCurrent: true }))
      .expect(201);

    const currents = await asSystem(() =>
      AcademicSession.find({ schoolId: schoolAId, isCurrent: true, deletedAt: null }).lean(),
    );
    expect(currents).toHaveLength(1);
    expect(String(currents[0]!._id)).toBe(second.body.data._id);
    expect(String(currents[0]!._id)).not.toBe(first.body.data._id);

    const currentRes = await request(app)
      .get('/api/v1/academic-sessions/current')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .expect(200);
    expect(currentRes.body.data.name).toBe('Current Two');
  });

  it('returns null for the current session when a school has none', async () => {
    const res = await request(app)
      .get('/api/v1/academic-sessions/current')
      .set('Authorization', `Bearer ${schoolBToken}`)
      .expect(200);
    expect(res.body.data).toBeNull();
  });

  it('refuses to archive the current session, and soft-deletes otherwise', async () => {
    const current = await asSystem(() => AcademicSession.findOne({ schoolId: schoolAId, isCurrent: true }));
    await request(app)
      .delete(`/api/v1/academic-sessions/${current!._id}`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .expect(409);

    const spare = await request(app)
      .post('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send(validBody({ name: 'To Archive' }))
      .expect(201);

    await request(app)
      .delete(`/api/v1/academic-sessions/${spare.body.data._id}`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .expect(204);

    // Soft delete: the row survives, but is gone from reads.
    const stored = await asSystem(() => AcademicSession.findById(spare.body.data._id).lean());
    expect(stored).not.toBeNull();
    expect(stored?.deletedAt).toBeInstanceOf(Date);

    await request(app)
      .get(`/api/v1/academic-sessions/${spare.body.data._id}`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .expect(404);
  });

  it('enforces permissions, not roles: a teacher can read but not create', async () => {
    await request(app)
      .get('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const res = await request(app)
      .post('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send(validBody({ name: 'Teacher Attempt' }))
      .expect(403);
    expect(res.body.error.message).toContain('session.create');
  });

  it('audit-logs every write with before/after', async () => {
    const created = await request(app)
      .post('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send(validBody({ name: 'Audited Session' }))
      .expect(201);

    await request(app)
      .patch(`/api/v1/academic-sessions/${created.body.data._id}`)
      .set('Authorization', `Bearer ${schoolAToken}`)
      .send({ name: 'Audited Session (renamed)' })
      .expect(200);

    const logs = await AuditLog.find({ entityId: created.body.data._id }).sort({ createdAt: 1 }).lean();
    expect(logs.map((l) => l.action)).toEqual(['academicSession.create', 'academicSession.update']);

    const update = logs[1]!;
    expect((update.before as { name: string }).name).toBe('Audited Session');
    expect((update.after as { name: string }).name).toBe('Audited Session (renamed)');
    expect(String(update.schoolId)).toBe(schoolAId);
  });

  it('paginates with the standard meta envelope', async () => {
    const res = await request(app)
      .get('/api/v1/academic-sessions?page=1&limit=2')
      .set('Authorization', `Bearer ${schoolAToken}`)
      .expect(200);

    expect(res.body.data.items.length).toBeLessThanOrEqual(2);
    expect(res.body.data.meta).toMatchObject({ page: 1, limit: 2 });
    expect(res.body.data.meta.total).toBeGreaterThan(2);
  });
});
