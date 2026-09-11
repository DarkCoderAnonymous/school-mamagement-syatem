import request from 'supertest';
import type { Express } from 'express';
import mongoose from 'mongoose';
import { Role } from '@sms/shared';
import { Plan } from '../../src/models/Plan';
import { RoleModel } from '../../src/models/Role';
import { User } from '../../src/models/User';
import { SchoolMembership } from '../../src/models/SchoolMembership';
import { hashPassword } from '../../src/utils/password';
import { TenantContext } from '../../src/tenant/context';

/**
 * Two complete schools, each with its own admin, users and a full graph of
 * tenant-owned records. Built once per run and shared by every cross-tenant
 * spec, so a new module inherits the fixture instead of rebuilding one.
 */
export interface SchoolFixture {
  label: 'A' | 'B';
  schoolId: string;
  adminUserId: string;
  adminEmail: string;
  token: string;
  membershipId: string;
  /** Ids of the records created for this school, keyed by registry entry name. */
  ids: Record<string, string>;
}

export interface CrossTenantFixture {
  a: SchoolFixture;
  b: SchoolFixture;
  superAdminToken: string;
}

/** Runs `fn` as this school's admin — exactly the context a request would establish. */
export function asSchool<T>(school: SchoolFixture, fn: () => Promise<T>): Promise<T> {
  return TenantContext.run(
    {
      schoolId: school.schoolId,
      userId: school.adminUserId,
      membershipId: school.membershipId,
      role: Role.SCHOOL_ADMIN,
      isSuperAdmin: false,
    },
    async () => await fn(),
  );
}

/** Unscoped access, for asserting on raw collection state. */
export function asSystem<T>(fn: () => Promise<T> | T): Promise<T> {
  return TenantContext.runAsSystem(async () => await fn());
}

let counter = 0;

/**
 * Unique per spec FILE, not just per call. Each file builds its own fixture
 * (Jest isolates module state), so a plain counter would hand the second file
 * the same registration email as the first and collide on the unique index.
 */
const RUN_ID = `${process.pid.toString(36)}${Date.now().toString(36).slice(-5)}`;

async function provisionSchool(
  app: Express,
  superAdminToken: string,
  planId: string,
  label: 'A' | 'B',
): Promise<SchoolFixture> {
  counter += 1;
  const email = `admin-${RUN_ID}-${counter}@xtenant.test`;

  const submitRes = await request(app)
    .post('/api/v1/registrations')
    .send({
      schoolName: `Cross Tenant School ${label}-${RUN_ID}-${counter}`,
      contactPerson: 'Admin Person',
      email,
      phone: '+1-555-0909',
      requestedPlanId: planId,
    })
    .expect(201);

  const approveRes = await request(app)
    .post(`/api/v1/admin/registrations/${submitRes.body.data.id}/approve`)
    .set('Authorization', `Bearer ${superAdminToken}`)
    .expect(200);

  const { adminEmail, tempPassword, school } = approveRes.body.data;
  await asSystem(() => User.updateOne({ email: adminEmail }, { $set: { mustChangePassword: false } }));

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: adminEmail, password: tempPassword })
    .expect(200);

  const schoolId = String(school._id);
  const membership = await asSystem(() => SchoolMembership.findOne({ schoolId }).lean());

  return {
    label,
    schoolId,
    adminUserId: loginRes.body.data.user.id,
    adminEmail,
    token: loginRes.body.data.accessToken,
    membershipId: String(membership!._id),
    ids: {},
  };
}

export async function buildFixture(app: Express): Promise<CrossTenantFixture> {
  const plan = await Plan.create({
    name: `Cross Tenant Plan ${RUN_ID}`,
    code: `XTENANT${RUN_ID.toUpperCase()}`,
    priceMinor: 1000,
    limits: { students: 500, staff: 100 },
  });

  const superAdminRole = await RoleModel.findOne({ schoolId: null, name: Role.SUPER_ADMIN });
  const superEmail = `super-${RUN_ID}@xtenant.test`;
  await asSystem(async () =>
    User.create({
      email: superEmail,
      passwordHash: await hashPassword('SuperPass123!'),
      firstName: 'Super',
      lastName: 'Admin',
      platformRoleIds: [superAdminRole!._id],
      status: 'ACTIVE',
    }),
  );

  const superLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: superEmail, password: 'SuperPass123!' })
    .expect(200);
  const superAdminToken = superLogin.body.data.accessToken as string;

  const planId = String(plan._id);
  const a = await provisionSchool(app, superAdminToken, planId, 'A');
  const b = await provisionSchool(app, superAdminToken, planId, 'B');

  return { a, b, superAdminToken };
}

/** An id that is well-formed but belongs to nothing — for "guessed id" probes. */
export function unknownId(): string {
  return String(new mongoose.Types.ObjectId());
}
