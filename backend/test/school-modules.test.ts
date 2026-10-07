import request from 'supertest';
import { Permission, Role } from '@sms/shared';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/db/connection';
import { ensureRbacSeeded } from '../src/rbac/seedRbac';
import { RoleModel } from '../src/models/Role';
import { User } from '../src/models/User';
import { SchoolMembership } from '../src/models/SchoolMembership';
import { Employee } from '../src/models/Employee';
import { InventoryMovement } from '../src/models/InventoryMovement';
import { hashPassword } from '../src/utils/password';
import { redis } from '../src/config/redis';
import { mailerQueue } from '../src/jobs/mailer.queue';
import { asSystem } from './helpers/as-system';
import { buildFixture, type CrossTenantFixture } from './cross-tenant/fixture';

/**
 * Business rules for classes, teachers, students, staff roles and inventory.
 * Tenant isolation for these modules is covered by the registry-driven
 * harness (test/cross-tenant/); this file covers what each module promises
 * inside one school, plus the two write paths the generic probes can't
 * express (member role/status routes and stock movements).
 */
const app = createApp();
let fx: CrossTenantFixture;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const asA = () => auth(fx.a.token);

/** Session → class → section, the placement every student needs. */
async function academicSetup() {
  const session = await request(app)
    .post('/api/v1/academic-sessions')
    .set(asA())
    .send({ name: `Year ${Date.now()}`, startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true })
    .expect(201);
  const cls = await request(app).post('/api/v1/classes').set(asA()).send({ name: `Grade ${Date.now()}`, order: 5 }).expect(201);
  const section = await request(app)
    .post('/api/v1/sections')
    .set(asA())
    .send({ classId: cls.body.data._id, name: 'A', capacity: 30 })
    .expect(201);
  return { sessionId: session.body.data._id as string, classId: cls.body.data._id as string, sectionId: section.body.data._id as string };
}

async function signIn(email: string, password: string): Promise<string> {
  await asSystem(async () =>
    User.updateOne({ email }, { $set: { passwordHash: await hashPassword(password), mustChangePassword: false } }),
  );
  const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return res.body.data.accessToken as string;
}

beforeAll(async () => {
  await connectDB();
  await ensureRbacSeeded();
  fx = await buildFixture(app);
}, 120_000);

afterAll(async () => {
  await disconnectDB();
  await mailerQueue.close();
  redis.disconnect();
});

describe('Principal role', () => {
  it('is provisioned into every new school with academic powers and role management but no fee writes', async () => {
    const principal = await asSystem(() => RoleModel.findOne({ schoolId: fx.a.schoolId, name: Role.PRINCIPAL }).lean());
    expect(principal).not.toBeNull();
    expect(principal!.permissions).toEqual(
      expect.arrayContaining([
        Permission.STUDENT_CREATE,
        Permission.TEACHER_UPDATE,
        Permission.INVENTORY_MANAGE,
        Permission.ROLE_ASSIGN,
        Permission.ROLE_MANAGE,
      ]),
    );
    expect(principal!.permissions).not.toContain(Permission.FEE_PAYMENT_RECORD);
    expect(principal!.permissions).not.toContain(Permission.SCHOOL_UPDATE);
  });
});

describe('Classes, teachers and students', () => {
  let placement: Awaited<ReturnType<typeof academicSetup>>;
  beforeAll(async () => {
    placement = await academicSetup();
  });

  it('defaults a new class to the current session and lists it with its sections', async () => {
    const res = await request(app).get('/api/v1/classes').set(asA()).expect(200);
    const cls = (res.body.data.items as { _id: string; academicSessionId: string; sections: unknown[] }[]).find(
      (c) => c._id === placement.classId,
    );
    expect(cls?.academicSessionId).toBe(placement.sessionId);
    expect(cls?.sections).toHaveLength(1);
  });

  it('creates a teacher with an employee number and a TEACHER sign-in linked to the record', async () => {
    const email = `new-teacher-${Date.now()}@modules.test`;
    const res = await request(app)
      .post('/api/v1/teachers')
      .set(asA())
      .send({ firstName: 'Nadia', lastName: 'Rahman', email, qualification: 'MSc Physics' })
      .expect(201);

    expect(res.body.data.employee.employeeNumber).toMatch(/^EMP-\d{4}$/);
    expect(res.body.data.account.pendingFirstSignIn).toBe(true);

    const membership = await asSystem(() =>
      SchoolMembership.findOne({ schoolId: fx.a.schoolId, teacherId: res.body.data._id }).populate('roleIds').lean(),
    );
    expect((membership!.roleIds as unknown as { name: string }[]).map((r) => r.name)).toContain(Role.TEACHER);

    // The same person twice is a conflict, not a duplicate teacher.
    await request(app)
      .post('/api/v1/teachers')
      .set(asA())
      .send({ firstName: 'Nadia', lastName: 'Rahman', email })
      .expect(409);
  });

  it('terminating a teacher disables their access at the school', async () => {
    const email = `leaving-${Date.now()}@modules.test`;
    const created = await request(app)
      .post('/api/v1/teachers')
      .set(asA())
      .send({ firstName: 'Leo', lastName: 'Leaving', email })
      .expect(201);
    const token = await signIn(email, 'Teacher123!');
    await request(app).get('/api/v1/students').set(auth(token)).expect(200);

    await request(app)
      .patch(`/api/v1/teachers/${created.body.data._id}`)
      .set(asA())
      .send({ status: 'TERMINATED' })
      .expect(200);
    const after = await request(app).get('/api/v1/students').set(auth(token));
    expect(after.status).toBe(401);
  });

  it('admits a student with a per-school admission number and a primary guardian', async () => {
    const res = await request(app)
      .post('/api/v1/students')
      .set(asA())
      .send({
        firstName: 'Ali',
        lastName: 'Khan',
        dateOfBirth: '2016-02-10',
        gender: 'MALE',
        classId: placement.classId,
        sectionId: placement.sectionId,
        guardians: [{ firstName: 'Omar', lastName: 'Khan', phone: '+92-300-0000001', relation: 'FATHER' }],
      })
      .expect(201);

    expect(res.body.data.admissionNumber).toMatch(/^ADM-2026-\d{4}$/);
    expect(res.body.data.guardians).toHaveLength(1);
    expect(res.body.data.guardians[0].isPrimary).toBe(true);
    expect(res.body.data.guardians[0].guardianId.firstName).toBe('Omar');
  });

  it("refuses a section that doesn't belong to the chosen class", async () => {
    const other = await request(app).post('/api/v1/classes').set(asA()).send({ name: `Other ${Date.now()}` }).expect(201);
    const res = await request(app)
      .post('/api/v1/students')
      .set(asA())
      .send({
        firstName: 'Mis',
        lastName: 'Placed',
        dateOfBirth: '2016-02-10',
        gender: 'FEMALE',
        classId: other.body.data._id,
        sectionId: placement.sectionId,
        guardians: [{ firstName: 'G', lastName: 'G', phone: '+1-555-3333', relation: 'MOTHER' }],
      })
      .expect(400);
    expect(res.body.error.details.field).toBe('sectionId');
  });

  it("won't archive a class that still has active students", async () => {
    await request(app).delete(`/api/v1/classes/${placement.classId}`).set(asA()).expect(409);
  });
});

describe('Staff and roles', () => {
  const roleId = async (schoolId: string, name: Role) =>
    String((await asSystem(() => RoleModel.findOne({ schoolId, name }).lean()))!._id);

  it('invites a principal who can manage students but cannot assign roles beyond their own powers', async () => {
    const email = `principal-${Date.now()}@modules.test`;
    await request(app)
      .post('/api/v1/members')
      .set(asA())
      .send({ firstName: 'Pria', lastName: 'Principal', email, roleIds: [await roleId(fx.a.schoolId, Role.PRINCIPAL)] })
      .expect(201);

    const token = await signIn(email, 'Principal123!');
    await request(app).get('/api/v1/teachers').set(auth(token)).expect(200);
    await request(app)
      .post('/api/v1/members')
      .set(auth(token))
      .send({ firstName: 'X', lastName: 'Y', email: `x-${Date.now()}@modules.test`, roleIds: [await roleId(fx.a.schoolId, Role.SCHOOL_ADMIN)] })
      .expect(403);
  });

  it("refuses family roles, other schools' roles, and changes to your own roles", async () => {
    const base = { firstName: 'X', lastName: 'Y', email: `fam-${Date.now()}@modules.test` };
    await request(app)
      .post('/api/v1/members')
      .set(asA())
      .send({ ...base, roleIds: [await roleId(fx.a.schoolId, Role.PARENT)] })
      .expect(400);
    await request(app)
      .post('/api/v1/members')
      .set(asA())
      .send({ ...base, roleIds: [await roleId(fx.b.schoolId, Role.ACCOUNTANT)] })
      .expect(400);
    await request(app)
      .patch(`/api/v1/members/${fx.a.membershipId}/roles`)
      .set(asA())
      .send({ roleIds: [await roleId(fx.a.schoolId, Role.TEACHER)] })
      .expect(403);
  });

  it('puts anyone given the Teacher role on the Teachers list, once', async () => {
    const teacherRole = await roleId(fx.a.schoolId, Role.TEACHER);
    const listed = async (email: string) =>
      ((await request(app).get(`/api/v1/teachers?search=${encodeURIComponent(email)}`).set(asA()).expect(200)).body.data.items as unknown[]).length;

    // Invited from Staff & roles with the Teacher role.
    const invitedEmail = `staff-teacher-${Date.now()}@modules.test`;
    await request(app)
      .post('/api/v1/members')
      .set(asA())
      .send({ firstName: 'Ina', lastName: 'Invited', email: invitedEmail, roleIds: [teacherRole] })
      .expect(201);
    expect(await listed(invitedEmail)).toBe(1);
    // Adding them again from the Teachers page is a duplicate, not a second record.
    await request(app).post('/api/v1/teachers').set(asA()).send({ firstName: 'Ina', lastName: 'Invited', email: invitedEmail }).expect(409);

    // An accountant who later also teaches: role change creates the record, reusing their employee file.
    const accountantEmail = `acct-teacher-${Date.now()}@modules.test`;
    const accountant = await request(app)
      .post('/api/v1/members')
      .set(asA())
      .send({ firstName: 'Ali', lastName: 'Accounts', email: accountantEmail, roleIds: [await roleId(fx.a.schoolId, Role.ACCOUNTANT)] })
      .expect(201);
    expect(await listed(accountantEmail)).toBe(0);
    const userId = (await asSystem(() => User.findOne({ email: accountantEmail }).lean()))!._id;
    await asSystem(() =>
      Employee.create({ schoolId: fx.a.schoolId, userId, employeeNumber: `EMP-PAY-${Date.now()}`, firstName: 'Ali', lastName: 'Accounts', email: accountantEmail, designation: 'Accountant', joiningDate: new Date('2025-01-01') }),
    );
    await request(app)
      .patch(`/api/v1/members/${accountant.body.data._id}/roles`)
      .set(asA())
      .send({ roleIds: [await roleId(fx.a.schoolId, Role.ACCOUNTANT), teacherRole] })
      .expect(200);
    expect(await listed(accountantEmail)).toBe(1);
    expect(await asSystem(() => Employee.countDocuments({ userId, deletedAt: null }))).toBe(1);
  });

  it("can't touch another school's membership through the role or status routes", async () => {
    await request(app)
      .patch(`/api/v1/members/${fx.b.membershipId}/roles`)
      .set(asA())
      .send({ roleIds: [await roleId(fx.a.schoolId, Role.ACCOUNTANT)] })
      .expect(404);
    await request(app)
      .patch(`/api/v1/members/${fx.b.membershipId}/status`)
      .set(asA())
      .send({ status: 'DISABLED' })
      .expect(404);
    const untouched = await asSystem(() => SchoolMembership.findById(fx.b.membershipId).lean());
    expect(untouched!.status).toBe('ACTIVE');
  });
});

describe('Custom roles', () => {
  let principalToken: string;
  const roleId = async (schoolId: string, name: string) =>
    String((await asSystem(() => RoleModel.findOne({ schoolId, name, deletedAt: null }).lean()))!._id);
  const createRole = (token: string, body: Record<string, unknown>) =>
    request(app).post('/api/v1/roles').set(auth(token)).send(body);

  beforeAll(async () => {
    const email = `principal-roles-${Date.now()}@modules.test`;
    await request(app)
      .post('/api/v1/members')
      .set(asA())
      .send({ firstName: 'Rana', lastName: 'Principal', email, roleIds: [await roleId(fx.a.schoolId, Role.PRINCIPAL)] })
      .expect(201);
    principalToken = await signIn(email, 'Principal123!');
  });

  it('lists school permissions grouped by module, without platform-only ones', async () => {
    const res = await request(app).get('/api/v1/roles/permissions').set(asA()).expect(200);
    const modules = res.body.data as { module: string; label: string; permissions: { code: string }[] }[];
    expect(modules.find((m) => m.module === 'student')?.label).toBe('Students & guardians');
    const codes = modules.flatMap((m) => m.permissions.map((p) => p.code));
    expect(codes).toContain(Permission.FEE_PAYMENT_RECORD);
    expect(codes).not.toContain(Permission.PLAN_MANAGE);
    expect(codes).not.toContain(Permission.REGISTRATION_APPROVE);
  });

  it('creates a custom role and refuses reserved, duplicate or platform-only definitions', async () => {
    const res = await createRole(fx.a.token, {
      name: 'Storekeeper',
      description: 'Runs the stock room',
      permissions: [Permission.INVENTORY_READ, Permission.INVENTORY_STOCK_RECORD],
    }).expect(201);
    expect(res.body.data).toMatchObject({ name: 'Storekeeper', isSystem: false, memberCount: 0 });

    await createRole(fx.a.token, { name: 'storekeeper', permissions: [Permission.NOTICE_READ] }).expect(409);
    await createRole(fx.a.token, { name: 'Super Admin', permissions: [Permission.NOTICE_READ] }).expect(400);
    await createRole(fx.a.token, { name: 'teacher', permissions: [Permission.NOTICE_READ] }).expect(400);
    await createRole(fx.a.token, { name: 'Planner', permissions: [Permission.PLAN_MANAGE] }).expect(400);
  });

  it("lets a principal build roles only from their own permissions", async () => {
    await createRole(principalToken, { name: 'Cashier', permissions: [Permission.FEE_PAYMENT_RECORD] }).expect(403);
    await createRole(principalToken, {
      name: 'Lab assistant',
      permissions: [Permission.INVENTORY_READ, Permission.CLASS_READ],
    }).expect(201);

    // A role the admin built with fee powers is out of the principal's reach.
    const cashier = await createRole(fx.a.token, { name: 'Cashier', permissions: [Permission.FEE_PAYMENT_RECORD] }).expect(201);
    await request(app)
      .patch(`/api/v1/roles/${cashier.body.data._id}`)
      .set(auth(principalToken))
      .send({ permissions: [Permission.INVENTORY_READ] })
      .expect(403);
    await request(app).delete(`/api/v1/roles/${cashier.body.data._id}`).set(auth(principalToken)).expect(403);
  });

  it("won't edit built-in roles, or another school's roles", async () => {
    await request(app)
      .patch(`/api/v1/roles/${await roleId(fx.a.schoolId, Role.TEACHER)}`)
      .set(asA())
      .send({ permissions: [Permission.NOTICE_READ] })
      .expect(403);

    const bRole = await createRole(fx.b.token, { name: 'B only', permissions: [Permission.NOTICE_READ] }).expect(201);
    await request(app)
      .patch(`/api/v1/roles/${bRole.body.data._id}`)
      .set(asA())
      .send({ permissions: [Permission.STUDENT_READ] })
      .expect(404);
    await request(app).delete(`/api/v1/roles/${bRole.body.data._id}`).set(asA()).expect(404);
    const untouched = await asSystem(() => RoleModel.findById(bRole.body.data._id).lean());
    expect(untouched!.permissions).toEqual([Permission.NOTICE_READ]);
    expect(untouched!.deletedAt).toBeNull();
  });

  it('gives holders exactly its modules, and editing it takes effect on their next request', async () => {
    const role = await createRole(fx.a.token, { name: 'Librarian', permissions: [Permission.INVENTORY_READ] }).expect(201);
    const email = `librarian-${Date.now()}@modules.test`;
    const invited = await request(app)
      .post('/api/v1/members')
      .set(asA())
      .send({ firstName: 'Lina', lastName: 'Librarian', email, roleIds: [role.body.data._id] })
      .expect(201);
    const token = await signIn(email, 'Librarian123!');

    await request(app).get('/api/v1/inventory/items').set(auth(token)).expect(200);
    await request(app).get('/api/v1/students').set(auth(token)).expect(403);

    await request(app)
      .patch(`/api/v1/roles/${role.body.data._id}`)
      .set(asA())
      .send({ permissions: [Permission.INVENTORY_READ, Permission.STUDENT_READ] })
      .expect(200);
    const stale = await request(app).get('/api/v1/students').set(auth(token)).expect(401);
    expect(stale.body.error.code).toBe('TOKEN_STALE');

    const fresh = await signIn(email, 'Librarian123!');
    await request(app).get('/api/v1/students').set(auth(fresh)).expect(200);

    // Deleting is refused while anyone holds it; once they've moved, the name is free again.
    await request(app).delete(`/api/v1/roles/${role.body.data._id}`).set(asA()).expect(409);
    await request(app)
      .patch(`/api/v1/members/${invited.body.data._id}/roles`)
      .set(asA())
      .send({ roleIds: [await roleId(fx.a.schoolId, Role.TEACHER)] })
      .expect(200);
    await request(app).delete(`/api/v1/roles/${role.body.data._id}`).set(asA()).expect(204);
    await createRole(fx.a.token, { name: 'Librarian', permissions: [Permission.INVENTORY_READ] }).expect(201);
  });

  it('never treats a school role named SUPER_ADMIN as the platform super admin', async () => {
    // Unreachable through the API (the name is reserved) — planted directly to
    // prove the token decision doesn't rest on the name alone.
    const planted = await asSystem(() =>
      RoleModel.create({ schoolId: fx.a.schoolId, name: Role.SUPER_ADMIN, isSystem: false, permissions: [Permission.NOTICE_READ] }),
    );
    const email = `impostor-${Date.now()}@modules.test`;
    const invited = await request(app)
      .post('/api/v1/members')
      .set(asA())
      .send({ firstName: 'Ima', lastName: 'Postor', email, roleIds: [await roleId(fx.a.schoolId, Role.TEACHER)] })
      .expect(201);
    await asSystem(() => SchoolMembership.updateOne({ _id: invited.body.data._id }, { $push: { roleIds: planted._id } }));
    try {
      const token = await signIn(email, 'Impostor123!');
      const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { isSuperAdmin: boolean };
      expect(payload.isSuperAdmin).toBe(false);
    } finally {
      await asSystem(() => RoleModel.deleteOne({ _id: planted._id }));
    }
  });
});

describe('Inventory', () => {
  let itemId: string;

  beforeAll(async () => {
    const category = await request(app).post('/api/v1/inventory/categories').set(asA()).send({ name: `Stationery ${Date.now()}` }).expect(201);
    const item = await request(app)
      .post('/api/v1/inventory/items')
      .set(asA())
      .send({ name: `Whiteboard marker ${Date.now()}`, categoryId: category.body.data._id, unit: 'BOX', unitCostMinor: 450, reorderLevel: 3, openingQuantity: 10 })
      .expect(201);
    itemId = item.body.data._id;
    expect(item.body.data.sku).toMatch(/^ITM-\d{4}$/);
    expect(item.body.data.quantityOnHand).toBe(10);
  });

  it('issues stock and keeps the ledger balance in step', async () => {
    const res = await request(app)
      .post(`/api/v1/inventory/items/${itemId}/movements`)
      .set(asA())
      .send({ type: 'ISSUE', quantity: 4, party: 'Grade 5-A' })
      .expect(201);
    expect(res.body.data.item.quantityOnHand).toBe(6);
    expect(res.body.data.movement.quantityChange).toBe(-4);
    expect(res.body.data.movement.balanceAfter).toBe(6);
  });

  it('never lets stock go negative, and records nothing when refused', async () => {
    const before = await asSystem(() => InventoryMovement.countDocuments({ itemId }));
    const res = await request(app)
      .post(`/api/v1/inventory/items/${itemId}/movements`)
      .set(asA())
      .send({ type: 'ISSUE', quantity: 7, party: 'Grade 6-B' })
      .expect(409);
    expect(res.body.error.details.available).toBe(6);
    expect(await asSystem(() => InventoryMovement.countDocuments({ itemId }))).toBe(before);
  });

  it('flags the item as low stock once it reaches the reorder level', async () => {
    await request(app)
      .post(`/api/v1/inventory/items/${itemId}/movements`)
      .set(asA())
      .send({ type: 'WRITE_OFF', quantity: 3, note: 'Dried out' })
      .expect(201);
    const low = await request(app).get('/api/v1/inventory/items?stock=low').set(asA()).expect(200);
    expect((low.body.data.items as { _id: string }[]).map((i) => i._id)).toContain(itemId);
  });

  it('refuses to archive an item that still has stock', async () => {
    await request(app).delete(`/api/v1/inventory/items/${itemId}`).set(asA()).expect(409);
  });

  it("can't move another school's stock", async () => {
    const other = await request(app)
      .post('/api/v1/inventory/categories')
      .set(auth(fx.b.token))
      .send({ name: `B cat ${Date.now()}` })
      .expect(201);
    const otherItem = await request(app)
      .post('/api/v1/inventory/items')
      .set(auth(fx.b.token))
      .send({ name: `B item ${Date.now()}`, categoryId: other.body.data._id, openingQuantity: 5 })
      .expect(201);

    await request(app)
      .post(`/api/v1/inventory/items/${otherItem.body.data._id}/movements`)
      .set(asA())
      .send({ type: 'WRITE_OFF', quantity: 5, note: 'Stolen by school A' })
      .expect(404);
    const stillThere = await request(app).get(`/api/v1/inventory/items/${otherItem.body.data._id}`).set(auth(fx.b.token)).expect(200);
    expect(stillThere.body.data.quantityOnHand).toBe(5);
  });
});
