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
import {
  bumpMembershipEpoch,
  clearFreshnessCache,
  revokeAllSessions,
} from '../src/services/auth-freshness.service';
import { redis } from '../src/config/redis';
import { mailerQueue } from '../src/jobs/mailer.queue';
import { asSystem } from './helpers/as-system';

/**
 * ADR-005 — permissions are denormalized into the token, so something has to
 * close the window between "the role changed" and "the token knows".
 *
 * NOTE: the suite runs with Redis deliberately unreachable (test/set-env.ts),
 * so every assertion here also exercises the database fallback. That is the
 * degraded path, and it must still fail closed rather than wave tokens
 * through — which is the property most worth testing.
 */

const app = createApp();

let superAdminToken: string;
let schoolId: string;
let adminEmail: string;
let adminPassword: string;
let membershipId: string;

beforeAll(async () => {
  await connectDB();
  await ensureRbacSeeded();

  const plan = await Plan.create({
    name: 'Freshness Plan',
    code: 'FRESHNESS',
    priceMinor: 1000,
    limits: { students: 50, staff: 10 },
  });

  const superAdminRole = await RoleModel.findOne({ schoolId: null, name: Role.SUPER_ADMIN });
  await asSystem(async () =>
    User.create({
      email: 'super@freshness.test',
      passwordHash: await hashPassword('SuperPass123!'),
      firstName: 'Super',
      lastName: 'Admin',
      platformRoleIds: [superAdminRole!._id],
      status: 'ACTIVE',
    }),
  );
  superAdminToken = (
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'super@freshness.test', password: 'SuperPass123!' })
      .expect(200)
  ).body.data.accessToken;

  const submitRes = await request(app)
    .post('/api/v1/registrations')
    .send({
      schoolName: 'Freshness School',
      contactPerson: 'Fresh Admin',
      email: 'admin@freshness.test',
      phone: '+1-555-0505',
      requestedPlanId: String(plan._id),
    })
    .expect(201);

  const approveRes = await request(app)
    .post(`/api/v1/admin/registrations/${submitRes.body.data.id}/approve`)
    .set('Authorization', `Bearer ${superAdminToken}`)
    .expect(200);

  schoolId = String(approveRes.body.data.school._id);
  adminEmail = approveRes.body.data.adminEmail;
  adminPassword = approveRes.body.data.tempPassword;

  await asSystem(() => User.updateOne({ email: adminEmail }, { $set: { mustChangePassword: false } }));

  const membership = await asSystem(() => SchoolMembership.findOne({ schoolId }).lean());
  membershipId = String(membership!._id);
});

afterAll(async () => {
  await disconnectDB();
  await mailerQueue.close();
  redis.disconnect();
});

async function signIn(): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: adminEmail, password: adminPassword })
    .expect(200);
  return { accessToken: res.body.data.accessToken, refreshToken: res.body.data.refreshToken };
}

describe('ADR-005 — permission freshness', () => {
  it('a freshly issued token is accepted', async () => {
    const { accessToken } = await signIn();
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('rejects a token whose permissions have since changed, with TOKEN_STALE', async () => {
    const { accessToken } = await signIn();

    await bumpMembershipEpoch(membershipId);
    // The in-process cache would otherwise mask the bump for up to 5s — a
    // real deployment absorbs that, a test must not depend on it.
    clearFreshnessCache();

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    // Distinct from an expired token: the client refreshes rather than
    // treating it as a sign-out.
    expect(res.body.error.code).toBe('TOKEN_STALE');
  });

  it('refreshing after a stale rejection issues a usable token with the new permissions', async () => {
    const { accessToken, refreshToken } = await signIn();

    // Grant a permission the role did not have, the way an admin edit would.
    await asSystem(async () => {
      const role = await RoleModel.findOne({ schoolId, name: Role.SCHOOL_ADMIN });
      await RoleModel.updateOne({ _id: role!._id }, { $addToSet: { permissions: 'payroll.run' } });
    });
    await bumpMembershipEpoch(membershipId);
    clearFreshnessCache();

    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.data.accessToken}`)
      .expect(200);

    // The new permission is present — proof the refresh re-resolved rather
    // than copying the old token's claims.
    expect(me.body.data.permissions).toContain('payroll.run');
  });

  it('a removed permission stops working immediately, not at token expiry', async () => {
    const { accessToken } = await signIn();

    // Confirm it works first, so the assertion below can only be about the removal.
    await request(app)
      .get('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await asSystem(async () => {
      const role = await RoleModel.findOne({ schoolId, name: Role.SCHOOL_ADMIN });
      await RoleModel.updateOne({ _id: role!._id }, { $pull: { permissions: 'session.read' } });
    });
    await bumpMembershipEpoch(membershipId);
    clearFreshnessCache();

    // The old token is refused outright rather than continuing to carry the
    // permission it was minted with.
    await request(app)
      .get('/api/v1/academic-sessions')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    // Restore, so later assertions aren't affected by ordering.
    await asSystem(async () => {
      const role = await RoleModel.findOne({ schoolId, name: Role.SCHOOL_ADMIN });
      await RoleModel.updateOne({ _id: role!._id }, { $addToSet: { permissions: 'session.read' } });
    });
    await bumpMembershipEpoch(membershipId);
    clearFreshnessCache();
  });

  it('revokeAllSessions ends every session and cannot be undone by refreshing', async () => {
    const { accessToken, refreshToken } = await signIn();

    await revokeAllSessions(
      String((await asSystem(() => User.findOne({ email: adminEmail }).lean()))!._id),
    );
    clearFreshnessCache();

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');

    // The distinction from TOKEN_STALE that matters: refresh must NOT revive it.
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('changing a password ends other sessions (previously it did not)', async () => {
    const first = await signIn();
    const second = await signIn();

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .send({ currentPassword: adminPassword, newPassword: 'BrandNewPass123!' })
      .expect(204);

    clearFreshnessCache();
    adminPassword = 'BrandNewPass123!';

    // The other device's session is gone, which is the point of doing this
    // after a suspected compromise.
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(401);
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
  });

  it('a platform SUPER_ADMIN has no membership epoch to check and still works', async () => {
    await request(app)
      .get('/api/v1/admin/registrations')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);
  });

  it('rejects a token for a membership that no longer exists', async () => {
    const { accessToken } = await signIn();

    await asSystem(() =>
      SchoolMembership.updateOne({ _id: membershipId }, { $set: { deletedAt: new Date() } }),
    );
    // A deleted membership has no valid epoch, so the sentinel must not
    // accidentally match a real token's value.
    clearFreshnessCache();

    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    await asSystem(() => SchoolMembership.updateOne({ _id: membershipId }, { $set: { deletedAt: null } }));
    clearFreshnessCache();
  });

  it('rejects a token for a membership that has been disabled', async () => {
    const { accessToken } = await signIn();

    await asSystem(() =>
      SchoolMembership.updateOne({ _id: membershipId }, { $set: { status: 'DISABLED' } }),
    );
    clearFreshnessCache();

    // Removing someone from a school takes effect on their next request, not
    // when their token happens to expire.
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    await asSystem(() =>
      SchoolMembership.updateOne({ _id: membershipId }, { $set: { status: 'ACTIVE' } }),
    );
    clearFreshnessCache();
  });
});
