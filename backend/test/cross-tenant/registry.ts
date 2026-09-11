import type { Model } from 'mongoose';
import { AcademicSession } from '../../src/models/AcademicSession';
import { Campus } from '../../src/models/Campus';
import { Class } from '../../src/models/Class';
import { Counter } from '../../src/models/Counter';
import { Employee } from '../../src/models/Employee';
import { FileUpload } from '../../src/models/FileUpload';
import { Guardian } from '../../src/models/Guardian';
import { Notification } from '../../src/models/Notification';
import { RefreshToken } from '../../src/models/RefreshToken';
import { SchoolMembership } from '../../src/models/SchoolMembership';
import { Section } from '../../src/models/Section';
import { Student } from '../../src/models/Student';
import { Subject } from '../../src/models/Subject';
import { Teacher } from '../../src/models/Teacher';
import { User } from '../../src/models/User';
import { TenantContext } from '../../src/tenant/context';
import type { SchoolFixture } from './fixture';

/** A person who exists but belongs to no school — for membership probes. */
async function freshUserId(seed: string): Promise<string> {
  const user = await TenantContext.runAsSystem(async () =>
    User.create({
      email: `probe-${seed}-${Date.now()}@xtenant.test`.toLowerCase(),
      passwordHash: 'x'.repeat(20),
      firstName: 'Probe',
      lastName: 'Person',
      status: 'ACTIVE',
    }),
  );
  return String(user._id);
}

/** A second Employee inside `school`, for probes that need an unused employeeId. */
async function freshEmployeeId(school: SchoolFixture, seed: string): Promise<string> {
  const employee = await Employee.create({
    schoolId: school.schoolId,
    userId: school.adminUserId,
    employeeNumber: `EMP-${school.label}-${seed}-${Date.now()}`,
    designation: 'Probe',
    joiningDate: new Date('2025-01-01'),
  });
  return String(employee._id);
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE CROSS-TENANT REGISTRY
 *
 *  Adding a module means adding an entry here. Nothing else. The specs in
 *  this folder generate themselves from these two arrays, so a new model or
 *  endpoint is covered by every isolation probe the moment it is registered
 *  — list, read, update, delete, guessed ids, forged bodies, forged query
 *  params, foreign-key references, and the plugin bypasses.
 *
 *  A module is NOT done until it appears below. See the definition of done
 *  in docs/school-saas-build-prompt.md.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Records are created in this order, so a factory can rely on earlier ids. */
export interface TenantModelEntry {
  /** Key used in `fixture.ids` and in test names. */
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is deliberately heterogeneous; each entry's own factory is typed
  model: Model<any>;
  /**
   * Builds a valid document for `school`. Runs inside that school's tenant
   * context. `seed` MUST vary every value covered by a unique index — probes
   * that create a second record would otherwise fail on a duplicate key and
   * pass for entirely the wrong reason.
   */
  build: (
    school: SchoolFixture,
    seed: string,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** A harmless field a cross-tenant write would try to change. */
  mutation: Record<string, unknown>;
  /**
   * Reference fields pointing at other tenant collections. Used to probe
   * whether a create can smuggle in another school's id as a foreign key.
   */
  foreignKeys?: { field: string; refEntry: string }[];
  /** Skip the populate probe for models with no refs worth following. */
  populate?: { path: string; refEntry: string };
  /**
   * Unique indexes that are DELIBERATELY global rather than compound with
   * schoolId. Each needs a reason: the default is that a global unique index
   * on a tenant collection lets one school block another and leaks existence.
   */
  allowedGlobalUniqueIndexes?: { name: string; because: string }[];
}

export const TENANT_MODELS: TenantModelEntry[] = [
  {
    name: 'academicSession',
    model: AcademicSession,
    build: (s, seed) => ({
      name: `Year ${s.label}${seed}`,
      startDate: new Date('2025-04-01'),
      endDate: new Date('2026-03-31'),
    }),
    mutation: { name: 'HIJACKED' },
  },
  {
    name: 'campus',
    model: Campus,
    build: (s, seed) => ({ name: `Main Campus ${s.label}${seed}`, isMain: true }),
    mutation: { name: 'HIJACKED' },
  },
  {
    name: 'subject',
    model: Subject,
    build: (s, seed) => ({ name: `Mathematics ${s.label}${seed}`, code: `MATH${s.label}${seed}` }),
    mutation: { name: 'HIJACKED' },
  },
  {
    name: 'class',
    model: Class,
    build: (s, seed) => ({
      name: `Grade 5 ${s.label}${seed}`,
      campusId: s.ids.campus,
      academicSessionId: s.ids.academicSession,
    }),
    mutation: { name: 'HIJACKED' },
    foreignKeys: [
      { field: 'academicSessionId', refEntry: 'academicSession' },
      { field: 'campusId', refEntry: 'campus' },
    ],
    populate: { path: 'academicSessionId', refEntry: 'academicSession' },
  },
  {
    name: 'section',
    model: Section,
    build: (s, seed) => ({ name: `Section ${s.label}${seed}`, classId: s.ids.class }),
    mutation: { name: 'HIJACKED' },
    foreignKeys: [{ field: 'classId', refEntry: 'class' }],
    populate: { path: 'classId', refEntry: 'class' },
  },
  {
    name: 'guardian',
    model: Guardian,
    build: (s, seed) => ({ firstName: 'Pat', lastName: `Guardian ${s.label}${seed}`, phone: '+1-555-1111' }),
    mutation: { firstName: 'HIJACKED' },
  },
  {
    name: 'employee',
    model: Employee,
    build: (s, seed) => ({
      userId: s.adminUserId,
      employeeNumber: `EMP-${s.label}-${seed || '1'}`,
      designation: 'Teacher',
      joiningDate: new Date('2025-01-01'),
    }),
    mutation: { designation: 'HIJACKED' },
  },
  {
    name: 'teacher',
    model: Teacher,
    // employeeId is unique, so a seeded probe must bring its own Employee —
    // reusing the fixture's collides on the index and the probe would then
    // fail for a reason unrelated to tenancy.
    build: async (s, seed) => ({
      employeeId: seed ? await freshEmployeeId(s, seed) : s.ids.employee,
      qualification: `MSc ${s.label}${seed}`,
    }),
    mutation: { qualification: 'HIJACKED' },
    foreignKeys: [{ field: 'employeeId', refEntry: 'employee' }],
    populate: { path: 'employeeId', refEntry: 'employee' },
  },
  {
    name: 'student',
    model: Student,
    build: (s, seed) => ({
      admissionNumber: `ADM-${s.label}-${seed || '1'}`,
      firstName: 'Sam',
      lastName: `Student ${s.label}`,
      dateOfBirth: new Date('2015-06-01'),
      gender: 'OTHER',
      classId: s.ids.class,
      sectionId: s.ids.section,
      academicSessionId: s.ids.academicSession,
    }),
    mutation: { firstName: 'HIJACKED' },
    foreignKeys: [
      { field: 'classId', refEntry: 'class' },
      { field: 'sectionId', refEntry: 'section' },
      { field: 'academicSessionId', refEntry: 'academicSession' },
    ],
    populate: { path: 'classId', refEntry: 'class' },
  },
  {
    name: 'notification',
    model: Notification,
    build: (s, seed) => ({
      recipientUserId: s.adminUserId,
      title: `Notice ${s.label}${seed}`,
      body: 'Body text',
    }),
    mutation: { title: 'HIJACKED' },
  },
  {
    name: 'fileUpload',
    model: FileUpload,
    build: (s, seed) => ({
      uploadedByUserId: s.adminUserId,
      originalName: `report-${s.label}${seed}.pdf`,
      storageKey: `schools/${s.schoolId}/report.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    }),
    mutation: { originalName: 'HIJACKED.pdf' },
  },
  {
    name: 'counter',
    model: Counter,
    build: (_s, seed) => ({ key: `invoice${seed}`, seq: 1 }),
    mutation: { seq: 9999 },
  },
  {
    name: 'schoolMembership',
    model: SchoolMembership,
    // Provisioned by the approval flow; the fixture reuses the existing row
    // rather than creating a second membership for the same user.
    // Unique on (userId, schoolId): a seeded probe needs a different person,
    // otherwise it collides with the membership the approval flow created.
    build: async (s, seed) => ({
      userId: seed ? await freshUserId(seed) : s.adminUserId,
      roleIds: [],
      status: 'INVITED',
    }),
    mutation: { status: 'DISABLED' },
  },
  {
    name: 'refreshToken',
    model: RefreshToken,
    build: (s, seed) => ({
      userId: s.adminUserId,
      tokenHash: `hash-${s.label}-${seed}-${Date.now()}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    }),
    mutation: { revokedAt: new Date() },
    allowedGlobalUniqueIndexes: [
      {
        name: 'tokenHash_1',
        because:
          'Refresh tokens are looked up by hash alone, before any tenant context exists ' +
          '(auth.service refreshUnscoped). A hash that collided across schools would be a ' +
          'genuine ambiguity, so global uniqueness is the correct constraint here.',
      },
    ],
  },
];

/**
 * Every HTTP surface that reads or writes tenant data. `create` payloads are
 * built per school so a forged-body probe has something valid to corrupt.
 */
export interface EndpointEntry {
  name: string;
  basePath: string;
  /** Payload for POST. Omit if the endpoint has no create. `seed` uniquifies it. */
  createBody?: (school: SchoolFixture, seed: string) => Record<string, unknown>;
  /** Body for PATCH. Omit if the endpoint has no update. */
  updateBody?: Record<string, unknown>;
  supports: { list?: boolean; get?: boolean; create?: boolean; patch?: boolean; remove?: boolean };
  /** Registry key whose id is used for get/patch/delete probes. */
  idFrom: string;
}

export const TENANT_ENDPOINTS: EndpointEntry[] = [
  {
    name: 'academic-sessions',
    basePath: '/api/v1/academic-sessions',
    idFrom: 'academicSession',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({
      name: `Endpoint Year ${s.label} ${seed}`,
      startDate: '2030-04-01T00:00:00.000Z',
      endDate: '2031-03-31T00:00:00.000Z',
    }),
    updateBody: { name: 'HIJACKED OVER HTTP' },
  },
];
