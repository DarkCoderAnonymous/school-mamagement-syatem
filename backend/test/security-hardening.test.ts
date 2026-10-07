import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import argon2 from 'argon2';
import { Role } from '@sms/shared';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/db/connection';
import { ensureRbacSeeded } from '../src/rbac/seedRbac';
import { envSchema } from '../src/config/env';
import { redis } from '../src/config/redis';
import { enqueueMail, MAIL_FAILED_RETENTION_SECONDS, mailerQueue } from '../src/jobs/mailer.queue';
import { AuditLog } from '../src/models/AuditLog';
import { Plan } from '../src/models/Plan';
import { RoleModel } from '../src/models/Role';
import { SalaryAdvance } from '../src/models/SalaryAdvance';
import { SchoolMembership } from '../src/models/SchoolMembership';
import { User } from '../src/models/User';
import { errorHandler } from '../src/middleware/error.middleware';
import { isSessionUpkeep, targetedLimiter } from '../src/middleware/rateLimiter';
import { neutraliseFormula } from '../src/modules/payroll/payroll.service';
import { mongoHosts, seedTargetProblem } from '../src/scripts/seed-guard';
import { ConsoleMailer, sanitizeHeaderValue } from '../src/utils/mailer';
import { hashPassword } from '../src/utils/password';
import { signSelectionToken } from '../src/utils/tokens';
import { asSystem } from './helpers/as-system';
import { buildFixture, type CrossTenantFixture } from './cross-tenant/fixture';

/**
 * Regression tests for the security-audit fixes (2026-09-30). Each block
 * names the finding it guards; each test fails on the pre-fix code.
 */
const app = createApp();
let fx: CrossTenantFixture;
/** School A's admin token — re-issued by the last test, which disables and re-enables A. */
let adminToken: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const asA = () => auth(adminToken);
let seq = 0;
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++seq}@security.test`;

async function roleId(name: string): Promise<string> {
  const role = await asSystem(() => RoleModel.findOne({ schoolId: fx.a.schoolId, name }).lean());
  return String(role!._id);
}

async function membershipOf(email: string) {
  return asSystem(async () => {
    const user = await User.findOne({ email }).lean();
    return SchoolMembership.findOne({ schoolId: fx.a.schoolId, userId: user!._id }).lean();
  });
}

/** Sets a known password, clears the first-login flag, signs in. */
async function signIn(email: string, password = 'Passw0rd!long'): Promise<string> {
  await asSystem(async () =>
    User.updateOne({ email }, { $set: { passwordHash: await hashPassword(password), mustChangePassword: false } }),
  );
  const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return res.body.data.accessToken as string;
}

/** Invites a member of school A with the given roles (by id). Returns their membership id. */
async function invite(email: string, roleIds: string[]): Promise<string> {
  await request(app).post('/api/v1/members').set(asA()).send({ firstName: 'Test', lastName: 'Person', email, roleIds }).expect(201);
  return String((await membershipOf(email))!._id);
}

let placement: { classId: string; sectionId: string };
let principalEmail: string;
let principalToken: string;

beforeAll(async () => {
  await connectDB();
  await ensureRbacSeeded();
  fx = await buildFixture(app);
  adminToken = fx.a.token;

  await request(app)
    .post('/api/v1/academic-sessions')
    .set(asA())
    .send({ name: 'Security 2026', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true })
    .expect(201);
  const classId = (await request(app).post('/api/v1/classes').set(asA()).send({ name: 'Security Grade' }).expect(201)).body.data._id;
  const sectionId = (await request(app).post('/api/v1/sections').set(asA()).send({ classId, name: 'A' }).expect(201)).body.data._id;
  placement = { classId, sectionId };

  principalEmail = uniqueEmail('principal');
  await invite(principalEmail, [await roleId(Role.PRINCIPAL)]);
  principalToken = await signIn(principalEmail);
}, 180_000);

afterAll(async () => {
  await disconnectDB();
  await mailerQueue.close();
  redis.disconnect();
});

function admitStudent(token: string, guardian: Record<string, unknown>) {
  return request(app)
    .post('/api/v1/students')
    .set(auth(token))
    .send({
      firstName: 'Sec',
      lastName: 'Student',
      dateOfBirth: '2016-05-05',
      gender: 'FEMALE',
      ...placement,
      guardians: [{ firstName: 'Guard', lastName: 'Ian', phone: '+1-555-1212', relation: 'FATHER', ...guardian }],
    });
}

// ─── H1 ─────────────────────────────────────────────────────────────────────

describe('H1: provisioning never re-enables a disabled membership', () => {
  it('refuses a guardian login for a disabled admin, who stays disabled and signed out', async () => {
    const xEmail = uniqueEmail('disabled-admin');
    const adminRoleId = await roleId(Role.SCHOOL_ADMIN);
    const xId = await invite(xEmail, [adminRoleId]);
    await request(app).patch(`/api/v1/members/${xId}/status`).set(asA()).send({ status: 'DISABLED' }).expect(200);

    // A principal holds student.update but not user.update.
    const res = await admitStudent(principalToken, { email: xEmail, createLogin: true });
    expect(res.status).toBe(409);

    const membership = await membershipOf(xEmail);
    expect(membership!.status).toBe('DISABLED');
    expect(membership!.roleIds.map(String)).toEqual([adminRoleId]);

    await asSystem(async () => User.updateOne({ email: xEmail }, { $set: { passwordHash: await hashPassword('Passw0rd!long') } }));
    await request(app).post('/api/v1/auth/login').send({ email: xEmail, password: 'Passw0rd!long' }).expect(403);
  });

  it('still lets a removed teacher be added back (a role-less membership grants nothing)', async () => {
    const email = uniqueEmail('rehire');
    const first = await request(app).post('/api/v1/teachers').set(asA()).send({ firstName: 'Re', lastName: 'Hire', email }).expect(201);
    await request(app).delete(`/api/v1/teachers/${first.body.data._id}`).set(asA()).expect(204);
    expect((await membershipOf(email))!.status).toBe('DISABLED');

    await request(app).post('/api/v1/teachers').set(asA()).send({ firstName: 'Re', lastName: 'Hire', email }).expect(201);
    const back = await membershipOf(email);
    expect(back!.status).toBe('ACTIVE');
    expect(back!.roleIds.map(String)).toContain(await roleId(Role.TEACHER));
  });
});

// ─── M1 ─────────────────────────────────────────────────────────────────────

describe('M1: nobody provisions themselves as a teacher', () => {
  it("refuses a principal's own email on POST /teachers and leaves their roles alone", async () => {
    await request(app).post('/api/v1/teachers').set(auth(principalToken)).send({ firstName: 'Self', lastName: 'Grant', email: principalEmail }).expect(403);
    const membership = await membershipOf(principalEmail);
    expect(membership!.roleIds.map(String)).toEqual([await roleId(Role.PRINCIPAL)]);
  });

  it('still lets a principal add someone else as a teacher', async () => {
    await request(app).post('/api/v1/teachers').set(auth(principalToken)).send({ firstName: 'New', lastName: 'Teacher', email: uniqueEmail('by-principal') }).expect(201);
  });
});

// ─── M2 ─────────────────────────────────────────────────────────────────────

describe('M2: teacher status changes pass the access checks', () => {
  it("won't let a principal terminate an administrator who also teaches", async () => {
    const email = uniqueEmail('admin-teacher');
    await invite(email, [await roleId(Role.SCHOOL_ADMIN), await roleId(Role.TEACHER)]);
    const { teacherId } = (await membershipOf(email))!;

    await request(app).patch(`/api/v1/teachers/${teacherId}`).set(auth(principalToken)).send({ status: 'TERMINATED' }).expect(403);
    expect((await membershipOf(email))!.status).toBe('ACTIVE');
  });

  it('still lets a principal terminate and reinstate an ordinary teacher', async () => {
    const email = uniqueEmail('plain-teacher');
    const created = await request(app).post('/api/v1/teachers').set(asA()).send({ firstName: 'Plain', lastName: 'Teacher', email }).expect(201);

    await request(app).patch(`/api/v1/teachers/${created.body.data._id}`).set(auth(principalToken)).send({ status: 'TERMINATED' }).expect(200);
    expect((await membershipOf(email))!.status).toBe('DISABLED');
    await request(app).patch(`/api/v1/teachers/${created.body.data._id}`).set(auth(principalToken)).send({ status: 'ACTIVE' }).expect(200);
    expect((await membershipOf(email))!.status).toBe('ACTIVE');
  });
});

// ─── M3 ─────────────────────────────────────────────────────────────────────

describe('M3: member status changes are bounded by the actor’s own permissions', () => {
  it('lets a user.update-only role disable a peer but not someone holding more', async () => {
    const deskRole = await request(app).post('/api/v1/roles').set(asA()).send({ name: 'Access desk', permissions: ['user.update'] }).expect(201);
    const deskEmail = uniqueEmail('desk');
    await invite(deskEmail, [deskRole.body.data._id]);
    const deskToken = await signIn(deskEmail);

    const teacherId = await invite(uniqueEmail('stronger'), [await roleId(Role.TEACHER)]);
    await request(app).patch(`/api/v1/members/${teacherId}/status`).set(auth(deskToken)).send({ status: 'DISABLED' }).expect(403);
    expect((await asSystem(() => SchoolMembership.findById(teacherId).lean()))!.status).toBe('ACTIVE');

    const peerId = await invite(uniqueEmail('peer'), [deskRole.body.data._id]);
    await request(app).patch(`/api/v1/members/${peerId}/status`).set(auth(deskToken)).send({ status: 'DISABLED' }).expect(200);
  });
});

// ─── M9 ─────────────────────────────────────────────────────────────────────

describe('M9: fee reminders have a 24-hour cooldown per family', () => {
  it("doesn't remind the same family twice in a row", async () => {
    const student = await admitStudent(adminToken, { email: uniqueEmail('overdue-parent') }).expect(201);
    const due = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    await request(app)
      .post('/api/v1/fees/invoices')
      .set(asA())
      .send({ studentId: student.body.data._id, lines: [{ name: 'Tuition', amountMinor: 5000 }], periodLabel: 'Overdue', dueDate: due, applyConcessions: false })
      .expect(201);

    const first = await request(app).post('/api/v1/fees/defaulters/remind').set(asA()).send({}).expect(200);
    expect(first.body.data.sent).toBe(1);

    const second = await request(app).post('/api/v1/fees/defaulters/remind').set(asA()).send({});
    expect(second.status).toBe(400);
    expect(second.body.error.message).toMatch(/already reminded/);
    await request(app).post('/api/v1/fees/defaulters/remind').set(asA()).send({ studentIds: [student.body.data._id] }).expect(400);
  });
});

// ─── M10 ────────────────────────────────────────────────────────────────────

describe('M10: attendance dates are bounded', () => {
  it('rejects 0001-01-01 quickly instead of walking 740k days', async () => {
    const started = Date.now();
    const res = await request(app).get('/api/v1/attendance/board?date=0001-01-01').set(asA());
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/too far in the past/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('still accepts a date from last year', async () => {
    const lastYear = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    const res = await request(app).get(`/api/v1/attendance/board?date=${lastYear}`).set(asA());
    expect(res.body.error?.message ?? '').not.toMatch(/too far|too long/);
  });
});

// ─── M11 ────────────────────────────────────────────────────────────────────

describe('M11: super-admin access is audit-logged', () => {
  it('records a cross-school read with method and path, but not the query string', async () => {
    await request(app).get('/api/v1/students?search=private-term').set(auth(fx.superAdminToken)).expect(200);
    const row = await asSystem(() =>
      AuditLog.findOne({ action: 'superadmin.access', 'metadata.path': '/api/v1/students' }).sort({ createdAt: -1 }).lean(),
    );
    expect(row).not.toBeNull();
    expect(row!.isSuperAdminBypass).toBe(true);
    expect(row!.metadata).toMatchObject({ method: 'GET', path: '/api/v1/students' });
    expect(JSON.stringify(row)).not.toContain('private-term');
  });
});

// ─── M13 ────────────────────────────────────────────────────────────────────

describe('M13: an advance is never recovered past its amount', () => {
  it('fails the second lock of two drafts that both deduct the last instalment', async () => {
    const teacher = await request(app)
      .post('/api/v1/teachers')
      .set(asA())
      .send({ firstName: 'Adv', lastName: 'Ance', email: uniqueEmail('advance'), joiningDate: '2025-01-01' })
      .expect(201);
    const employeeId = teacher.body.data.employee._id as string;
    await request(app).post('/api/v1/payroll/structures').set(asA()).send({ employeeId, basicMinor: 100000, components: [] }).expect(201);
    const advance = await request(app).post('/api/v1/payroll/advances').set(asA()).send({ employeeId, amountMinor: 5000, installmentMinor: 5000 }).expect(201);

    const jan = (await request(app).post('/api/v1/payroll/runs').set(asA()).send({ month: '2026-01' }).expect(201)).body.data._id;
    const feb = (await request(app).post('/api/v1/payroll/runs').set(asA()).send({ month: '2026-02' }).expect(201)).body.data._id;

    await request(app).post(`/api/v1/payroll/runs/${jan}/lock`).set(asA()).expect(200);
    const second = await request(app).post(`/api/v1/payroll/runs/${feb}/lock`).set(asA());
    expect(second.status).toBe(409);

    const stored = await asSystem(() => SalaryAdvance.findById(advance.body.data._id).lean());
    expect(stored!.recoveredMinor).toBe(5000);
    expect((await request(app).get(`/api/v1/payroll/runs/${feb}`).set(asA()).expect(200)).body.data.status).toBe('DRAFT');

    // Recalculating picks up the settled advance; the lock then goes through.
    await request(app).post(`/api/v1/payroll/runs/${feb}/recalculate`).set(asA()).expect(200);
    await request(app).post(`/api/v1/payroll/runs/${feb}/lock`).set(asA()).expect(200);
    expect((await asSystem(() => SalaryAdvance.findById(advance.body.data._id).lean()))!.recoveredMinor).toBe(5000);
  });
});

// ─── Auth: L1–L4, M6, M7 ────────────────────────────────────────────────────

describe('L1: refresh rotation is atomic', () => {
  it('lets exactly one of several concurrent refreshes with one token succeed', async () => {
    const email = uniqueEmail('refresher');
    await invite(email, [await roleId(Role.TEACHER)]);
    await signIn(email);
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Passw0rd!long' }).expect(200);
    const token = login.body.data.refreshToken as string;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/api/v1/auth/refresh').send({ refreshToken: token })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 401)).toHaveLength(4);
  });
});

describe('L2: only access tokens authenticate', () => {
  it('refuses a select-school token with a clean 401', async () => {
    const selection = signSelectionToken(fx.a.adminUserId);
    const me = await request(app).get('/api/v1/auth/me').set(auth(selection));
    expect(me.status).toBe(401);
    await request(app).get('/api/v1/students').set(auth(selection)).expect(401);
  });
});

describe('L3: unknown emails cost the same as wrong passwords', () => {
  it('runs a password verification even when the email has no account', async () => {
    const spy = jest.spyOn(argon2, 'verify');
    try {
      await request(app).post('/api/v1/auth/login').send({ email: uniqueEmail('nobody'), password: 'whatever-pass' }).expect(401);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('L4: a temporary password only reaches the /auth self-service routes', () => {
  it('blocks the API until the password is changed', async () => {
    const email = uniqueEmail('first-login');
    await invite(email, [await roleId(Role.PRINCIPAL)]);
    await asSystem(async () => User.updateOne({ email }, { $set: { passwordHash: await hashPassword('TempPass!123') } }));

    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'TempPass!123' }).expect(200);
    const temp = login.body.data.accessToken as string;
    const blocked = await request(app).get('/api/v1/students').set(auth(temp));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await request(app).get('/api/v1/auth/me').set(auth(temp)).expect(200);

    await request(app).post('/api/v1/auth/change-password').set(auth(temp)).send({ currentPassword: 'TempPass!123', newPassword: 'MyOwnPass!456' }).expect(204);
    // The change ends every session issued up to this second (iat has
    // one-second resolution), so sign in again the way a person would: after.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const fresh = await request(app).post('/api/v1/auth/login').send({ email, password: 'MyOwnPass!456' }).expect(200);
    await request(app).get('/api/v1/students').set(auth(fresh.body.data.accessToken)).expect(200);
  });
});

describe('M6: per-account limits on sign-in and reset emails', () => {
  it('stops the 4th reset email to one address within the hour, whatever the IP', async () => {
    const email = uniqueEmail('reset-target');
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/v1/auth/forgot-password').set('X-Forwarded-For', `203.0.113.${i + 1}`).send({ email }).expect(204);
    }
    await request(app).post('/api/v1/auth/forgot-password').set('X-Forwarded-For', '203.0.113.99').send({ email }).expect(429);
    await request(app).post('/api/v1/auth/forgot-password').send({ email: uniqueEmail('other') }).expect(204);
  });

  it('stops sign-in for an account after 20 failures', async () => {
    const email = uniqueEmail('sprayed');
    for (let i = 0; i < 20; i++) {
      await request(app).post('/api/v1/auth/login').send({ email, password: `wrong-${i}` }).expect(401);
    }
    const locked = await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong-again' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('TOO_MANY_REQUESTS');
  }, 60_000);

  it('budgets authenticated requests per user, not per IP', async () => {
    const limited = express();
    limited.use(targetedLimiter({ prefix: 'rl:test-user:', windowMs: 60_000, limit: 3, message: 'slow down', keyGenerator: (req) => req.header('x-user') }));
    limited.get('/', (_req: Request, res: Response) => { res.json({ ok: true }); });
    for (let i = 0; i < 3; i++) await request(limited).get('/').set('x-user', 'u1').expect(200);
    await request(limited).get('/').set('x-user', 'u1').expect(429);
    await request(limited).get('/').set('x-user', 'u2').expect(200);

    // And the real API applies the per-user limiter to authenticated routes.
    const res = await request(app).get('/api/v1/students').set(asA()).expect(200);
    expect(res.headers['ratelimit-limit']).toBe(process.env.API_RATE_LIMIT_MAX);

    // Bulk-work endpoints carry the tighter per-user budget on top.
    const today = new Date().toISOString().slice(0, 10);
    const report = await request(app).get(`/api/v1/fees/reports/collections?from=${today}&to=${today}`).set(asA()).expect(200);
    expect(report.headers['ratelimit-limit']).toBe(process.env.HEAVY_RATE_LIMIT_MAX);
  });
});

describe('M7: session upkeep is not counted as sign-in attempts', () => {
  it('skips refresh, me and logout but counts login and reset', () => {
    for (const p of ['/refresh', '/me', '/logout']) expect(isSessionUpkeep({ path: p })).toBe(true);
    for (const p of ['/login', '/select-school', '/forgot-password', '/reset-password']) expect(isSessionUpkeep({ path: p })).toBe(false);
  });
});

// ─── M8, L5–L7 ──────────────────────────────────────────────────────────────

describe('M8: public registrations are bounded', () => {
  const base = () => ({ schoolName: 'Bounded School', contactPerson: 'Pat', email: uniqueEmail('apply'), phone: '+1-555-3434', requestedPlanId: 'plan' });

  it('rejects oversized fields and too many documents', async () => {
    await request(app).post('/api/v1/registrations').send({ ...base(), schoolName: 'x'.repeat(10_000) }).expect(400);
    const documents = Array.from({ length: 21 }, (_, i) => ({ name: `doc ${i}`, url: `https://example.test/${i}` }));
    await request(app).post('/api/v1/registrations').send({ ...base(), documents }).expect(400);
  });

  it('limits submissions per IP', async () => {
    const limited = express();
    limited.use(targetedLimiter({ prefix: 'rl:test-registration:', windowMs: 60_000, limit: 2, message: 'later', keyGenerator: (req) => `ip:${req.ip}` }));
    limited.post('/', (_req: Request, res: Response) => { res.status(201).end(); });
    await request(limited).post('/').expect(201);
    await request(limited).post('/').expect(201);
    await request(limited).post('/').expect(429);
  });
});

describe('L5: search and sort input is handled safely', () => {
  it('treats regex metacharacters as text and ignores unknown sorts', async () => {
    await request(app).get('/api/v1/academic-sessions?search=(').set(asA()).expect(200);
    await request(app).get('/api/v1/academic-sessions?sort=,').set(asA()).expect(200);
    await request(app).get('/api/v1/admin/schools?search=(&sort=,').set(auth(fx.superAdminToken)).expect(200);
    await request(app).get('/api/v1/admin/registrations?search=[').set(auth(fx.superAdminToken)).expect(200);
    await request(app).get('/api/v1/admin/plans?limit=100000').set(auth(fx.superAdminToken)).expect(400);
  });
});

describe('L6: payments cannot be future-dated', () => {
  it('rejects a paidAt in the future at validation', async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const res = await request(app)
      .post('/api/v1/fees/payments')
      .set(asA())
      .send({ studentId: new mongoose.Types.ObjectId().toHexString(), amountMinor: 100, method: 'CASH', paidAt: future });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.paidAt).toBeDefined();
  });
});

describe('L7: platform accounts never become school admins by approval', () => {
  it('refuses to approve an application made with a platform account’s email', async () => {
    const email = uniqueEmail('platform');
    const superRole = await RoleModel.findOne({ schoolId: null, name: Role.SUPER_ADMIN }).lean();
    await asSystem(async () =>
      User.create({ email, passwordHash: await hashPassword('Passw0rd!long'), firstName: 'Plat', lastName: 'Form', platformRoleIds: [superRole!._id], status: 'ACTIVE' }),
    );
    const planId = String((await asSystem(() => Plan.findOne().lean()))!._id);
    const submitted = await request(app)
      .post('/api/v1/registrations')
      .send({ schoolName: 'Platform Collision', contactPerson: 'Plat Form', email, phone: '+1-555-5656', requestedPlanId: planId })
      .expect(201);
    await request(app).post(`/api/v1/admin/registrations/${submitted.body.data.id}/approve`).set(auth(fx.superAdminToken)).expect(409);
    const user = await asSystem(() => User.findOne({ email }).lean());
    expect(await asSystem(() => SchoolMembership.countDocuments({ userId: user!._id }))).toBe(0);
  });
});

// ─── Pure units: H2, H4, M4, M5, L9, L14, L15, L20 ──────────────────────────

describe('H2: mail secrets stay out of production logs and Redis', () => {
  it('logs recipient and subject only in production, the full body in development', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await new ConsoleMailer(false).send({ to: 'a@b.test', subject: 'Reset', body: 'token SECRET-RESET-TOKEN' });
      expect(log.mock.calls.flat().join(' ')).not.toContain('SECRET-RESET-TOKEN');
      await new ConsoleMailer(true).send({ to: 'a@b.test', subject: 'Reset', body: 'token DEV-VISIBLE' });
      expect(log.mock.calls.flat().join(' ')).toContain('DEV-VISIBLE');
    } finally {
      log.mockRestore();
    }
  });

  it('queues mail jobs that are removed once delivered and expire when failed, with single-line headers', async () => {
    const add = jest.spyOn(mailerQueue, 'add').mockResolvedValue({} as never);
    try {
      await enqueueMail({ to: 'a@b.test\r\n', subject: 'Hi\r\nBcc: victim@evil.test', body: 'x' });
      const [, data, opts] = add.mock.calls[0]!;
      expect(data.subject).toBe('Hi Bcc: victim@evil.test');
      expect(data.to).toBe('a@b.test');
      expect(opts).toMatchObject({ removeOnComplete: true, removeOnFail: { age: MAIL_FAILED_RETENTION_SECONDS } });
      expect(MAIL_FAILED_RETENTION_SECONDS).toBe(7 * 24 * 60 * 60);
    } finally {
      add.mockRestore();
    }
  });

  it('keeps header sanitising to line breaks only', () => {
    expect(sanitizeHeaderValue('Fee reminder — Amira Khan')).toBe('Fee reminder — Amira Khan');
  });
});

describe('H4: seed scripts refuse non-local databases', () => {
  it('classifies targets', () => {
    expect(mongoHosts('mongodb://sms:pw@localhost:27017/sms_dev?replicaSet=rs0')).toEqual(['localhost']);
    expect(seedTargetProblem('mongodb://sms:pw@localhost:27017/db', 'development', false)).toBeNull();
    expect(seedTargetProblem('mongodb://127.0.0.1:27017,localhost:27018/db', 'development', false)).toBeNull();
    expect(seedTargetProblem('mongodb+srv://u:p@cluster0.example.net/db', 'development', false)).toMatch(/remote/);
    expect(seedTargetProblem('mongodb://u:p@db.example.net:27017/db', 'development', false)).toMatch(/non-local/);
    expect(seedTargetProblem('mongodb+srv://u:p@cluster0.example.net/db', 'development', true)).toBeNull();
    expect(seedTargetProblem('mongodb://localhost/db', 'production', true)).toMatch(/production/);
  });

  it.each(['seed.ts', 'create-dummy-school.ts'])('%s exits before connecting to a remote URI, without printing it', (script) => {
    const secret = 'S3cretPassw0rdNeverPrint';
    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), path.join(__dirname, '../src/scripts', script)], {
      // A cwd with no .env, so nothing but this environment is loaded.
      cwd: tmpdir(),
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'development',
        MONGO_URI: `mongodb+srv://seeduser:${secret}@cluster0.example.invalid/sms`,
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
        REDIS_URL: 'redis://127.0.0.1:1',
      },
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Refusing to run/);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
  }, 90_000);
});

describe('M4, M5, L15: production configuration must be explicit and strong', () => {
  const production = {
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb://db.internal:27017/sms',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    CORS_ORIGIN: 'https://app.school.example',
    MAILER_DRIVER: 'console',
  };
  const issues = (env: Record<string, string | undefined>) => {
    const parsed = envSchema.safeParse(env);
    return parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'));
  };

  it('accepts a complete production config', () => {
    expect(issues(production)).toEqual([]);
  });

  it('refuses a missing NODE_ENV', () => {
    expect(issues({ ...production, NODE_ENV: undefined })).toContain('NODE_ENV');
  });

  it('refuses wildcard or missing CORS in production, but allows it in development', () => {
    expect(issues({ ...production, CORS_ORIGIN: undefined })).toContain('CORS_ORIGIN');
    expect(issues({ ...production, CORS_ORIGIN: 'https://a.example,*' })).toContain('CORS_ORIGIN');
    expect(issues({ ...production, NODE_ENV: 'development', CORS_ORIGIN: undefined })).toEqual([]);
  });

  it('refuses short, placeholder or identical JWT secrets in production', () => {
    expect(issues({ ...production, JWT_ACCESS_SECRET: 'short_but_16_chars' })).toContain('JWT_ACCESS_SECRET');
    expect(issues({ ...production, JWT_ACCESS_SECRET: 'change_me_access_secret_change_me' })).toContain('JWT_ACCESS_SECRET');
    expect(issues({ ...production, JWT_REFRESH_SECRET: production.JWT_ACCESS_SECRET })).toContain('JWT_REFRESH_SECRET');
  });

  it('refuses production without an explicit mail driver or with the dev temp password', () => {
    expect(issues({ ...production, MAILER_DRIVER: undefined })).toContain('MAILER_DRIVER');
    expect(issues({ ...production, DEV_TEMP_PASSWORD: 'Welcome@123' })).toContain('DEV_TEMP_PASSWORD');
  });

  it('parses TRUST_PROXY into what express expects', () => {
    const parse = (v: string) => (envSchema.safeParse({ ...production, TRUST_PROXY: v }) as { data: { TRUST_PROXY: unknown } }).data.TRUST_PROXY;
    expect(parse('1')).toBe(1);
    expect(parse('false')).toBe(false);
    expect(parse('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
  });
});

describe('L9: CSV formula injection', () => {
  it('neutralises formula-leading cells and leaves the rest', () => {
    expect(neutraliseFormula('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(neutraliseFormula('+923001234567')).toBe(`'+923001234567`);
    expect(neutraliseFormula('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(neutraliseFormula('Amira Khan')).toBe('Amira Khan');
    expect(neutraliseFormula('1160.00')).toBe('1160.00');
  });
});

describe('L14: database errors name fields, never values', () => {
  function capture(err: unknown) {
    let body: unknown;
    const res = { status: () => res, json: (b: unknown) => { body = b; return res; } } as unknown as Response;
    errorHandler(err, {} as Request, res, () => undefined);
    return JSON.stringify(body);
  }

  it('reports which field clashed on a duplicate key', () => {
    const out = capture({ code: 11000, keyValue: { schoolId: 'abc', email: 'someone@private.test' } });
    expect(out).toContain('"field":"email"');
    expect(out).not.toContain('someone@private.test');
  });

  it('reports which fields failed Mongoose validation', () => {
    const ve = new mongoose.Error.ValidationError();
    ve.addError('status', new mongoose.Error.ValidatorError({ path: 'status', message: '`bogus-secret` is not valid', value: 'bogus-secret' }));
    const out = capture(ve);
    expect(out).toContain('status');
    expect(out).not.toContain('bogus-secret');
  });
});

// ─── Last: disables and re-enables school A's admin ─────────────────────────

describe('M2: the last active School Admin is kept', () => {
  it("won't let a teacher status change disable the school's only remaining admin", async () => {
    const me = await request(app).get('/api/v1/auth/me').set(asA()).expect(200);
    const deputyRole = await request(app).post('/api/v1/roles').set(asA()).send({ name: 'Deputy head', permissions: me.body.data.permissions }).expect(201);
    const deputyEmail = uniqueEmail('deputy');
    await invite(deputyEmail, [deputyRole.body.data._id]);
    const deputyToken = await signIn(deputyEmail);

    const lastEmail = uniqueEmail('last-admin');
    await invite(lastEmail, [await roleId(Role.SCHOOL_ADMIN), await roleId(Role.TEACHER)]);
    const last = (await membershipOf(lastEmail))!;

    // Leave `last` as the only active School Admin.
    const adminRoleId = await roleId(Role.SCHOOL_ADMIN);
    const others = await asSystem(() =>
      SchoolMembership.find({ schoolId: fx.a.schoolId, roleIds: adminRoleId, status: 'ACTIVE', _id: { $ne: last._id } }).lean(),
    );
    for (const m of others) {
      await request(app).patch(`/api/v1/members/${m._id}/status`).set(auth(deputyToken)).send({ status: 'DISABLED' }).expect(200);
    }

    await request(app).patch(`/api/v1/teachers/${last.teacherId}`).set(auth(deputyToken)).send({ status: 'TERMINATED' }).expect(409);
    expect((await membershipOf(lastEmail))!.status).toBe('ACTIVE');

    for (const m of others) {
      await request(app).patch(`/api/v1/members/${m._id}/status`).set(auth(deputyToken)).send({ status: 'ACTIVE' }).expect(200);
    }
    adminToken = await signIn(fx.a.adminEmail);
  });
});
