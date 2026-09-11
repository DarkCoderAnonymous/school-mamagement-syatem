import request from 'supertest';
import { Role } from '@sms/shared';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/db/connection';
import { ensureRbacSeeded } from '../src/rbac/seedRbac';
import { Plan } from '../src/models/Plan';
import { RoleModel } from '../src/models/Role';
import { User } from '../src/models/User';
import { SchoolMembership } from '../src/models/SchoolMembership';
import { hashPassword } from '../src/utils/password';
import { redis } from '../src/config/redis';
import { mailerQueue } from '../src/jobs/mailer.queue';
import { asSystem } from './helpers/as-system';

/**
 * ADR-001 — the two cases the split exists for:
 * a teacher employed at two schools, and a parent with children at two.
 */

const app = createApp();

let superAdminToken: string;
let schoolAId: string;
let schoolBId: string;
let counter = 0;

async function provisionSchool(planId: string): Promise<{ schoolId: string; adminEmail: string }> {
  counter += 1;
  const email = `head-${counter}@identity.test`;

  const submitRes = await request(app)
    .post('/api/v1/registrations')
    .send({
      schoolName: `Identity School ${counter}`,
      contactPerson: 'Head Teacher',
      email,
      phone: '+1-555-0303',
      requestedPlanId: planId,
    })
    .expect(201);

  const approveRes = await request(app)
    .post(`/api/v1/admin/registrations/${submitRes.body.data.id}/approve`)
    .set('Authorization', `Bearer ${superAdminToken}`)
    .expect(200);

  return { schoolId: String(approveRes.body.data.school._id), adminEmail: approveRes.body.data.adminEmail };
}

/** Gives an existing person a membership at a school, as account provisioning will. */
async function addMembership(userId: string, schoolId: string, roleName: Role) {
  return asSystem(async () => {
    const role = await RoleModel.findOne({ schoolId, name: roleName });
    return SchoolMembership.create({
      userId,
      schoolId,
      roleIds: [role!._id],
      status: 'ACTIVE',
    });
  });
}

async function createPerson(email: string, password: string) {
  return asSystem(async () =>
    User.create({
      email,
      passwordHash: await hashPassword(password),
      firstName: 'Multi',
      lastName: 'School',
      status: 'ACTIVE',
    }),
  );
}

beforeAll(async () => {
  await connectDB();
  await ensureRbacSeeded();

  const plan = await Plan.create({
    name: 'Identity Plan',
    code: 'IDENTITY',
    priceMinor: 1000,
    limits: { students: 50, staff: 10 },
  });

  const superAdminRole = await RoleModel.findOne({ schoolId: null, name: Role.SUPER_ADMIN });
  await asSystem(async () =>
    User.create({
      email: 'super@identity.test',
      passwordHash: await hashPassword('SuperPass123!'),
      firstName: 'Super',
      lastName: 'Admin',
      platformRoleIds: [superAdminRole!._id],
      status: 'ACTIVE',
    }),
  );
  const superLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'super@identity.test', password: 'SuperPass123!' })
    .expect(200);
  superAdminToken = superLogin.body.data.accessToken;

  const planId = String(plan._id);
  schoolAId = (await provisionSchool(planId)).schoolId;
  schoolBId = (await provisionSchool(planId)).schoolId;
});

afterAll(async () => {
  await disconnectDB();
  await mailerQueue.close();
  redis.disconnect();
});

describe('ADR-001 — one person, several schools', () => {
  it('a platform SUPER_ADMIN logs straight in with no membership', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'super@identity.test', password: 'SuperPass123!' })
      .expect(200);

    expect(res.body.data.kind).toBe('tokens');
    expect(res.body.data.user.schoolId).toBeNull();
    expect(res.body.data.user.membershipId).toBeNull();
    expect(res.body.data.user.roles).toContain('SUPER_ADMIN');
    expect(res.body.data.user.memberships).toHaveLength(0);
  });

  it('a person with ONE membership logs in directly, no picker', async () => {
    const user = await createPerson('single@identity.test', 'SinglePass123!');
    await addMembership(String(user._id), schoolAId, Role.TEACHER);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'single@identity.test', password: 'SinglePass123!' })
      .expect(200);

    expect(res.body.data.kind).toBe('tokens');
    expect(res.body.data.user.schoolId).toBe(schoolAId);
    expect(res.body.data.user.memberships).toHaveLength(1);
  });

  it('a TEACHER at two schools gets a choice instead of a guessed session', async () => {
    const teacher = await createPerson('teacher@identity.test', 'TeachPass123!');
    await addMembership(String(teacher._id), schoolAId, Role.TEACHER);
    // Different role at the second school — the thing an array of schoolIds
    // could never express.
    await addMembership(String(teacher._id), schoolBId, Role.EXAM_CONTROLLER);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@identity.test', password: 'TeachPass123!' })
      .expect(200);

    expect(res.body.data.kind).toBe('select-school');
    // Critically: no session is issued yet.
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.selectionToken).toBeTruthy();
    expect(res.body.data.memberships).toHaveLength(2);

    const roleByShool = Object.fromEntries(
      res.body.data.memberships.map((m: { schoolId: string; roles: string[] }) => [m.schoolId, m.roles]),
    );
    expect(roleByShool[schoolAId]).toEqual(['TEACHER']);
    expect(roleByShool[schoolBId]).toEqual(['EXAM_CONTROLLER']);
  });

  it('select-school issues a session scoped to the chosen school only', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@identity.test', password: 'TeachPass123!' })
      .expect(200);

    const res = await request(app)
      .post('/api/v1/auth/select-school')
      .send({ selectionToken: login.body.data.selectionToken, schoolId: schoolBId })
      .expect(200);

    expect(res.body.data.user.schoolId).toBe(schoolBId);
    expect(res.body.data.user.roles).toEqual(['EXAM_CONTROLLER']);
    // Permissions are the second school's, not a union of both.
    expect(res.body.data.user.permissions).toContain('exam.marks.enter');
    expect(res.body.data.user.permissions).not.toContain('attendance.mark');
  });

  it('refuses a school the person has no membership at, even with a valid selection token', async () => {
    const outsider = await createPerson('outsider@identity.test', 'OutPass123!');
    await addMembership(String(outsider._id), schoolAId, Role.TEACHER);
    const other = await createPerson('other@identity.test', 'OtherPass123!');
    await addMembership(String(other._id), schoolBId, Role.TEACHER);
    await addMembership(String(other._id), schoolAId, Role.TEACHER);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'other@identity.test', password: 'OtherPass123!' })
      .expect(200);

    // A valid token proves WHO is choosing, never WHAT they may choose — so a
    // tampered schoolId must be rejected server-side.
    await request(app)
      .post('/api/v1/auth/select-school')
      .send({ selectionToken: login.body.data.selectionToken, schoolId: '0'.repeat(24) })
      .expect(403);
  });

  it('rejects an ordinary access token used as a selection token', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'single@identity.test', password: 'SinglePass123!' })
      .expect(200);

    await request(app)
      .post('/api/v1/auth/select-school')
      .send({ selectionToken: login.body.data.accessToken, schoolId: schoolAId })
      .expect(401);
  });

  it('switch-school moves an active session and revokes the old refresh token', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@identity.test', password: 'TeachPass123!' })
      .expect(200);

    const first = await request(app)
      .post('/api/v1/auth/select-school')
      .send({ selectionToken: login.body.data.selectionToken, schoolId: schoolAId })
      .expect(200);

    expect(first.body.data.user.schoolId).toBe(schoolAId);

    const switched = await request(app)
      .post('/api/v1/auth/switch-school')
      .set('Authorization', `Bearer ${first.body.data.accessToken}`)
      .send({ schoolId: schoolBId, refreshToken: first.body.data.refreshToken })
      .expect(200);

    expect(switched.body.data.user.schoolId).toBe(schoolBId);
    expect(switched.body.data.user.roles).toEqual(['EXAM_CONTROLLER']);
    expect(switched.body.data.accessToken).not.toBe(first.body.data.accessToken);

    // The previous session's refresh token must not survive the switch.
    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.body.data.refreshToken })
      .expect(401);
  });

  it('refuses to switch to a school the person does not belong to', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'single@identity.test', password: 'SinglePass123!' })
      .expect(200);

    await request(app)
      .post('/api/v1/auth/switch-school')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ schoolId: schoolBId })
      .expect(403);
  });

  it('a PARENT at two schools keeps one account and separate per-school links', async () => {
    const parent = await createPerson('parent@identity.test', 'ParentPass123!');
    const atA = await addMembership(String(parent._id), schoolAId, Role.PARENT);
    const atB = await addMembership(String(parent._id), schoolBId, Role.PARENT);

    // One identity…
    const users = await asSystem(() => User.find({ email: 'parent@identity.test' }).lean());
    expect(users).toHaveLength(1);

    // …two memberships, each able to carry that school's own guardian record.
    expect(String(atA.schoolId)).toBe(schoolAId);
    expect(String(atB.schoolId)).toBe(schoolBId);
    expect(String(atA._id)).not.toBe(String(atB._id));

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'parent@identity.test', password: 'ParentPass123!' })
      .expect(200);
    expect(login.body.data.kind).toBe('select-school');
    expect(login.body.data.memberships).toHaveLength(2);
  });

  it('/auth/me reports the active school plus every membership, for the switcher', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@identity.test', password: 'TeachPass123!' })
      .expect(200);

    const session = await request(app)
      .post('/api/v1/auth/select-school')
      .send({ selectionToken: login.body.data.selectionToken, schoolId: schoolAId })
      .expect(200);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.body.data.accessToken}`)
      .expect(200);

    expect(me.body.data.schoolId).toBe(schoolAId);
    expect(me.body.data.memberships).toHaveLength(2);
  });

  it('refuses login for a person with no membership and no platform role', async () => {
    await createPerson('orphan@identity.test', 'OrphanPass123!');

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'orphan@identity.test', password: 'OrphanPass123!' })
      .expect(403);

    expect(res.body.error.code).toBe('NO_ACTIVE_MEMBERSHIP');
  });

  it('reuses an existing identity when that person opens another school', async () => {
    const before = await asSystem(() => User.countDocuments({ email: 'teacher@identity.test' }));
    expect(before).toBe(1);

    const plan = await Plan.findOne({ code: 'IDENTITY' }).lean();
    const submitRes = await request(app)
      .post('/api/v1/registrations')
      .send({
        schoolName: 'Teacher Owned School',
        contactPerson: 'Multi School',
        email: 'teacher@identity.test',
        phone: '+1-555-0404',
        requestedPlanId: String(plan!._id),
      })
      .expect(201);

    const approve = await request(app)
      .post(`/api/v1/admin/registrations/${submitRes.body.data.id}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    // No second User row, and no password reset for an account that already
    // has one — just another membership.
    expect(await asSystem(() => User.countDocuments({ email: 'teacher@identity.test' }))).toBe(1);
    expect(approve.body.data.tempPassword).toBeNull();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@identity.test', password: 'TeachPass123!' })
      .expect(200);
    expect(login.body.data.memberships).toHaveLength(3);
  });
});
