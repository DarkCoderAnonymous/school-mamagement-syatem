import type { Model } from 'mongoose';
import { AcademicSession } from '../../src/models/AcademicSession';
import { Campus } from '../../src/models/Campus';
import { Class } from '../../src/models/Class';
import { Counter } from '../../src/models/Counter';
import { Employee } from '../../src/models/Employee';
import { FileUpload } from '../../src/models/FileUpload';
import { Guardian } from '../../src/models/Guardian';
import { FeeHead } from '../../src/models/FeeHead';
import { FeeStructure } from '../../src/models/FeeStructure';
import { FeeConcession } from '../../src/models/FeeConcession';
import { FeeInvoice } from '../../src/models/FeeInvoice';
import { FeePayment } from '../../src/models/FeePayment';
import { SalaryComponent } from '../../src/models/SalaryComponent';
import { SalaryStructure } from '../../src/models/SalaryStructure';
import { SalaryAdvance } from '../../src/models/SalaryAdvance';
import { PayrollRun } from '../../src/models/PayrollRun';
import { Payslip } from '../../src/models/Payslip';
import { FinanceCategory } from '../../src/models/FinanceCategory';
import { LedgerEntry } from '../../src/models/LedgerEntry';
import { Exam } from '../../src/models/Exam';
import { ExamPaper } from '../../src/models/ExamPaper';
import { Mark } from '../../src/models/Mark';
import { ExamResult } from '../../src/models/ExamResult';
import { InventoryCategory } from '../../src/models/InventoryCategory';
import { InventoryItem } from '../../src/models/InventoryItem';
import { InventoryMovement } from '../../src/models/InventoryMovement';
import { Notification } from '../../src/models/Notification';
import { RefreshToken } from '../../src/models/RefreshToken';
import { SchoolMembership } from '../../src/models/SchoolMembership';
import { Section } from '../../src/models/Section';
import { Student } from '../../src/models/Student';
import { Subject } from '../../src/models/Subject';
import { Teacher } from '../../src/models/Teacher';
import { TeachingAssignment } from '../../src/models/TeachingAssignment';
import { Attendance } from '../../src/models/Attendance';
import { Holiday } from '../../src/models/Holiday';
import { StaffAttendance } from '../../src/models/StaffAttendance';
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
    firstName: 'Probe',
    lastName: `Employee ${school.label}`,
    designation: 'Probe',
    joiningDate: new Date('2025-01-01'),
  });
  return String(employee._id);
}

/** Letters/digits only — fee and salary codes and receipt numbers reject punctuation. */
const token = (label: string, seed: string) => `${label}${seed}`.replace(/[^A-Za-z0-9]/g, '').slice(-20);

/**
 * A "YYYY-MM" that varies with the seed: payroll runs are unique per month,
 * so every probe needs its own. Years 2040+ keep clear of real data and of the
 * endpoint probe's months (2039).
 */
function seedMonth(label: string, seed: string, baseYear = 2040): string {
  let h = 7;
  for (const ch of `${label}${seed}`) h = (h * 31 + ch.charCodeAt(0)) % 1_000_003;
  const year = baseYear + (h % 50);
  const month = (Math.floor(h / 50) % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Papers are unique per (exam, class, subject), marks per (paper, student)
 * and results per (exam, student): a seeded probe brings its own subject,
 * paper or exam so it never collides with the fixture's rows on an index.
 */
async function freshSubjectId(school: SchoolFixture, seed: string): Promise<string> {
  const subject = await Subject.create({ schoolId: school.schoolId, name: `Probe subject ${school.label}${seed}`, code: `PS${token(school.label, seed)}${Date.now() % 100000}` });
  return String(subject._id);
}
async function freshPaperId(school: SchoolFixture, seed: string): Promise<string> {
  const paper = await ExamPaper.create({
    schoolId: school.schoolId,
    examId: school.ids.exam,
    classId: school.ids.class,
    subjectId: await freshSubjectId(school, seed),
    maxMarks: 100,
    passMarks: 33,
  });
  return String(paper._id);
}
async function freshExamId(school: SchoolFixture, seed: string): Promise<string> {
  const exam = await Exam.create({
    schoolId: school.schoolId,
    name: `Probe exam ${school.label}${seed}-${Date.now()}`,
    academicSessionId: school.ids.academicSession,
    startDate: new Date('2025-05-01'),
    endDate: new Date('2025-05-10'),
  });
  return String(exam._id);
}

/**
 * Attendance is unique per (student, day): a seeded probe needs its own day.
 * Years 2031+ keep clear of real registers.
 */
function seedDay(seed: string): Date {
  let h = 11;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 1_000_003;
  return new Date(Date.UTC(2031, 0, 1) + (h % 3650) * 86_400_000);
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
  /** Reason this model's unique values genuinely cannot be reused after a soft delete. */
  uniqueValueReuseNotApplicable?: string;
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
      firstName: 'Terry',
      lastName: `Teacher ${s.label}${seed}`,
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
    name: 'teachingAssignment',
    model: TeachingAssignment,
    // Unique per (teacher, section, subject), so every build brings its own
    // subject — including the fixture's, leaving the fixture subject free for
    // the endpoint probe's POST.
    build: async (s, seed) => ({
      teacherId: s.ids.teacher,
      sectionId: s.ids.section,
      classId: s.ids.class,
      academicSessionId: s.ids.academicSession,
      subjectId: await freshSubjectId(s, seed || 'assignment'),
    }),
    mutation: { subjectId: '0000000000000000000000a1' },
    foreignKeys: [
      { field: 'teacherId', refEntry: 'teacher' },
      { field: 'sectionId', refEntry: 'section' },
      { field: 'subjectId', refEntry: 'subject' },
    ],
    populate: { path: 'teacherId', refEntry: 'teacher' },
  },
  {
    name: 'attendance',
    model: Attendance,
    build: (s, seed) => ({
      studentId: s.ids.student,
      sectionId: s.ids.section,
      classId: s.ids.class,
      academicSessionId: s.ids.academicSession,
      date: seedDay(seed),
      status: 'PRESENT',
      markedByUserId: s.adminUserId,
    }),
    mutation: { remark: 'HIJACKED' },
    foreignKeys: [
      { field: 'studentId', refEntry: 'student' },
      { field: 'sectionId', refEntry: 'section' },
    ],
    populate: { path: 'studentId', refEntry: 'student' },
  },
  {
    name: 'staffAttendance',
    model: StaffAttendance,
    build: (s, seed) => ({ employeeId: s.ids.employee, date: seedDay(seed), status: 'PRESENT', markedByUserId: s.adminUserId }),
    mutation: { remark: 'HIJACKED' },
    foreignKeys: [{ field: 'employeeId', refEntry: 'employee' }],
    populate: { path: 'employeeId', refEntry: 'employee' },
  },
  {
    name: 'holiday',
    model: Holiday,
    build: (s, seed) => ({ name: `Founders Day ${s.label}${seed}`, startDate: seedDay(seed), endDate: seedDay(seed) }),
    mutation: { name: 'HIJACKED' },
  },
  {
    name: 'inventoryCategory',
    model: InventoryCategory,
    build: (s, seed) => ({ name: `Science lab ${s.label}${seed}` }),
    mutation: { name: 'HIJACKED' },
  },
  {
    name: 'inventoryItem',
    model: InventoryItem,
    build: (s, seed) => ({
      name: `Microscope ${s.label}${seed}`,
      sku: `ITM-${s.label}${seed || '1'}`.replace(/[^A-Za-z0-9-]/g, ''),
      categoryId: s.ids.inventoryCategory,
      quantityOnHand: 5,
      reorderLevel: 2,
    }),
    mutation: { name: 'HIJACKED' },
    foreignKeys: [{ field: 'categoryId', refEntry: 'inventoryCategory' }],
    populate: { path: 'categoryId', refEntry: 'inventoryCategory' },
  },
  {
    name: 'inventoryMovement',
    model: InventoryMovement,
    build: (s, seed) => ({
      itemId: s.ids.inventoryItem,
      type: 'RECEIVE',
      quantityChange: 5,
      balanceAfter: 5,
      note: `Opening stock ${s.label}${seed}`,
      recordedByUserId: s.adminUserId,
    }),
    mutation: { note: 'HIJACKED' },
    foreignKeys: [{ field: 'itemId', refEntry: 'inventoryItem' }],
    populate: { path: 'itemId', refEntry: 'inventoryItem' },
  },
  {
    name: 'feeHead',
    model: FeeHead,
    build: (s, seed) => ({ name: `Tuition ${s.label}${seed}`, code: `TU${token(s.label, seed)}` }),
    mutation: { name: 'HIJACKED' },
  },
  {
    name: 'feeStructure',
    model: FeeStructure,
    build: (s, seed) => ({
      name: `Structure ${s.label}${seed}`,
      academicSessionId: s.ids.academicSession,
      classId: s.ids.class,
      items: [{ feeHeadId: s.ids.feeHead, amountMinor: 5000 }],
    }),
    mutation: { name: 'HIJACKED' },
    foreignKeys: [
      { field: 'academicSessionId', refEntry: 'academicSession' },
      { field: 'classId', refEntry: 'class' },
    ],
    populate: { path: 'classId', refEntry: 'class' },
  },
  {
    name: 'feeConcession',
    model: FeeConcession,
    build: (s, seed) => ({ studentId: s.ids.student, name: `Sibling ${s.label}${seed}`, type: 'PERCENT', value: 10 }),
    mutation: { name: 'HIJACKED' },
    foreignKeys: [{ field: 'studentId', refEntry: 'student' }],
    populate: { path: 'studentId', refEntry: 'student' },
  },
  {
    name: 'feeInvoice',
    model: FeeInvoice,
    // Due long ago, so the fixture invoice is overdue and the defaulters list has a row.
    build: (s, seed) => ({
      invoiceNumber: `INV-${token(s.label, seed) || s.label}`,
      studentId: s.ids.student,
      classId: s.ids.class,
      periodKey: `P${token(s.label, seed) || s.label}`,
      periodLabel: `Period ${s.label}${seed}`,
      issueDate: new Date('2025-01-01'),
      dueDate: new Date('2025-01-10'),
      lines: [{ name: 'Tuition', amountMinor: 10000 }],
      subtotalMinor: 10000,
      totalMinor: 10000,
    }),
    mutation: { periodLabel: 'HIJACKED' },
    foreignKeys: [
      { field: 'studentId', refEntry: 'student' },
      { field: 'classId', refEntry: 'class' },
    ],
    populate: { path: 'studentId', refEntry: 'student' },
  },
  {
    name: 'feePayment',
    model: FeePayment,
    build: (s, seed) => ({
      receiptNumber: `RCPT-${token(s.label, seed) || s.label}`,
      studentId: s.ids.student,
      allocations: [{ invoiceId: s.ids.feeInvoice, amountMinor: 1000 }],
      amountMinor: 1000,
      method: 'CASH',
      paidAt: new Date('2025-02-01'),
      receivedByUserId: s.adminUserId,
    }),
    mutation: { reference: 'HIJACKED' },
    foreignKeys: [{ field: 'studentId', refEntry: 'student' }],
    populate: { path: 'studentId', refEntry: 'student' },
  },
  {
    name: 'salaryComponent',
    model: SalaryComponent,
    build: (s, seed) => ({
      name: `House rent ${s.label}${seed}`,
      code: `HR${token(s.label, seed)}`,
      type: 'EARNING',
      calculation: 'PERCENT_OF_BASIC',
      defaultValue: 40,
    }),
    mutation: { name: 'HIJACKED' },
  },
  {
    name: 'salaryStructure',
    model: SalaryStructure,
    // One structure per employee, so a seeded probe brings its own employee.
    build: async (s, seed) => ({
      employeeId: seed ? await freshEmployeeId(s, seed) : s.ids.employee,
      basicMinor: 50000,
      components: [{ componentId: s.ids.salaryComponent, value: 40 }],
      effectiveFrom: new Date('2025-01-01'),
    }),
    mutation: { bankName: 'HIJACKED' },
    foreignKeys: [{ field: 'employeeId', refEntry: 'employee' }],
    populate: { path: 'employeeId', refEntry: 'employee' },
  },
  {
    name: 'salaryAdvance',
    model: SalaryAdvance,
    build: (s, seed) => ({
      employeeId: s.ids.employee,
      amountMinor: 10000,
      installmentMinor: 2000,
      reason: `Advance ${s.label}${seed}`,
      issuedAt: new Date('2025-01-01'),
    }),
    mutation: { reason: 'HIJACKED' },
    foreignKeys: [{ field: 'employeeId', refEntry: 'employee' }],
    populate: { path: 'employeeId', refEntry: 'employee' },
  },
  {
    name: 'payrollRun',
    model: PayrollRun,
    build: (s, seed) => ({ month: seedMonth(s.label, seed), notes: `Run ${s.label}${seed}` }),
    mutation: { notes: 'HIJACKED' },
  },
  {
    name: 'payslip',
    model: Payslip,
    // Unique per (run, employee): a seeded probe brings its own employee.
    build: async (s, seed) => ({
      payrollRunId: s.ids.payrollRun,
      employeeId: seed ? await freshEmployeeId(s, seed) : s.ids.employee,
      userId: s.adminUserId,
      month: seedMonth(s.label, ''),
      employee: { name: `Payee ${s.label}${seed}`, employeeNumber: `EMP-${s.label}` },
      daysInMonth: 31,
      basicMinor: 50000,
      grossMinor: 70000,
      totalDeductionsMinor: 5000,
      netMinor: 65000,
    }),
    mutation: { unpaidLeaveDays: 9 },
    foreignKeys: [
      { field: 'payrollRunId', refEntry: 'payrollRun' },
      { field: 'employeeId', refEntry: 'employee' },
    ],
    populate: { path: 'payrollRunId', refEntry: 'payrollRun' },
  },
  {
    name: 'financeCategory',
    model: FinanceCategory,
    build: (s, seed) => ({ name: `Utilities ${s.label}${seed}`, type: 'EXPENSE' }),
    mutation: { name: 'HIJACKED' },
  },
  {
    name: 'ledgerEntry',
    model: LedgerEntry,
    build: (s, seed) => ({
      type: 'EXPENSE',
      categoryId: s.ids.financeCategory,
      amountMinor: 5000,
      date: new Date('2025-03-01'),
      description: `Electricity ${s.label}${seed}`,
      recordedByUserId: s.adminUserId,
    }),
    mutation: { description: 'HIJACKED' },
    foreignKeys: [{ field: 'categoryId', refEntry: 'financeCategory' }],
    populate: { path: 'categoryId', refEntry: 'financeCategory' },
  },
  {
    name: 'exam',
    model: Exam,
    build: (s, seed) => ({
      name: `Mid-term ${s.label}${seed}`,
      type: 'MIDTERM',
      academicSessionId: s.ids.academicSession,
      startDate: new Date('2025-05-01'),
      endDate: new Date('2025-05-10'),
    }),
    mutation: { description: 'HIJACKED' },
    foreignKeys: [{ field: 'academicSessionId', refEntry: 'academicSession' }],
    populate: { path: 'academicSessionId', refEntry: 'academicSession' },
  },
  {
    name: 'examPaper',
    model: ExamPaper,
    build: async (s, seed) => ({
      examId: s.ids.exam,
      classId: s.ids.class,
      subjectId: seed ? await freshSubjectId(s, seed) : s.ids.subject,
      maxMarks: 100,
      passMarks: 33,
    }),
    mutation: { returnReason: 'HIJACKED' },
    foreignKeys: [
      { field: 'examId', refEntry: 'exam' },
      { field: 'classId', refEntry: 'class' },
      { field: 'subjectId', refEntry: 'subject' },
    ],
    populate: { path: 'subjectId', refEntry: 'subject' },
  },
  {
    name: 'mark',
    model: Mark,
    build: async (s, seed) => ({
      examPaperId: seed ? await freshPaperId(s, seed) : s.ids.examPaper,
      examId: s.ids.exam,
      studentId: s.ids.student,
      marksObtained: 72,
    }),
    mutation: { remarks: 'HIJACKED' },
    foreignKeys: [
      { field: 'examPaperId', refEntry: 'examPaper' },
      { field: 'studentId', refEntry: 'student' },
    ],
    populate: { path: 'studentId', refEntry: 'student' },
  },
  {
    name: 'examResult',
    model: ExamResult,
    build: async (s, seed) => ({
      examId: seed ? await freshExamId(s, seed) : s.ids.exam,
      studentId: s.ids.student,
      classId: s.ids.class,
      student: { name: `Sam Student ${s.label}`, admissionNumber: `ADM-${s.label}` },
      examName: `Mid-term ${s.label}${seed}`,
      className: `Grade ${s.label}`,
      subjects: [{ name: 'Mathematics', maxMarks: 100, passMarks: 33, marksObtained: 72, percentage: 72, grade: 'B', passed: true }],
      totalObtained: 72,
      totalMax: 100,
      percentage: 72,
      grade: 'B',
      result: 'PASS',
      classRank: 1,
      publishedAt: new Date('2025-05-20'),
    }),
    mutation: { remark: 'HIJACKED' },
    foreignKeys: [
      { field: 'examId', refEntry: 'exam' },
      { field: 'studentId', refEntry: 'student' },
      { field: 'classId', refEntry: 'class' },
    ],
    populate: { path: 'studentId', refEntry: 'student' },
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
    uniqueValueReuseNotApplicable:
      'A refresh token hash is a random 48-byte secret and is never reissued. Sessions end ' +
      'via revokedAt, not soft delete, so there is no value to reuse.',
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
  {
    name: 'classes',
    basePath: '/api/v1/classes',
    idFrom: 'class',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({ name: `Endpoint Grade ${s.label} ${seed}`, academicSessionId: s.ids.academicSession }),
    updateBody: { name: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'sections',
    basePath: '/api/v1/sections',
    idFrom: 'section',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({ classId: s.ids.class, name: `E${seed}`.slice(0, 30) }),
    updateBody: { name: 'HIJACKED' },
  },
  {
    name: 'subjects',
    basePath: '/api/v1/subjects',
    idFrom: 'subject',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({
      name: `Endpoint Physics ${s.label}${seed}`,
      code: `P${s.label}${seed}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 12),
    }),
    updateBody: { name: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'teachers',
    basePath: '/api/v1/teachers',
    idFrom: 'teacher',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({
      firstName: 'Endpoint',
      lastName: `Teacher ${s.label}`,
      email: `teacher-${s.label}${seed}-${Date.now()}@xtenant.test`.toLowerCase(),
      subjectIds: [s.ids.subject],
    }),
    updateBody: { qualification: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'teaching-assignments',
    basePath: '/api/v1/teaching-assignments',
    idFrom: 'teachingAssignment',
    supports: { list: true, create: true, remove: true },
    createBody: (s) => ({ teacherId: s.ids.teacher, sectionId: s.ids.section, subjectId: s.ids.subject }),
  },
  {
    name: 'teacher-classes',
    basePath: '/api/v1/teaching-assignments/teachers',
    idFrom: 'teacher',
    supports: { get: true },
  },
  {
    name: 'holidays',
    basePath: '/api/v1/attendance/holidays',
    idFrom: 'holiday',
    supports: { list: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({ name: `Endpoint holiday ${s.label}${seed}`.slice(0, 80), startDate: '2032-01-01' }),
    updateBody: { name: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'student-attendance',
    basePath: '/api/v1/attendance/students',
    idFrom: 'student',
    supports: { get: true },
  },
  {
    name: 'employee-attendance',
    basePath: '/api/v1/staff-attendance/employees',
    idFrom: 'employee',
    supports: { get: true },
  },
  {
    name: 'students',
    basePath: '/api/v1/students',
    idFrom: 'student',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({
      firstName: 'Endpoint',
      lastName: `Student ${s.label}${seed}`,
      dateOfBirth: '2015-06-01T00:00:00.000Z',
      gender: 'FEMALE',
      classId: s.ids.class,
      sectionId: s.ids.section,
      guardians: [{ firstName: 'Pat', lastName: 'Parent', phone: '+1-555-2222', relation: 'MOTHER' }],
    }),
    updateBody: { firstName: 'HIJACKED' },
  },
  {
    name: 'guardians',
    basePath: '/api/v1/guardians',
    idFrom: 'guardian',
    supports: { list: true, get: true, patch: true },
    updateBody: { firstName: 'HIJACKED' },
  },
  {
    name: 'members',
    basePath: '/api/v1/members',
    idFrom: 'schoolMembership',
    // Writes are /:id/roles and /:id/status, not the generic PATCH/DELETE the
    // probes know; those paths are covered in test/school-modules.test.ts.
    supports: { list: true, get: true },
  },
  {
    name: 'inventory-categories',
    basePath: '/api/v1/inventory/categories',
    idFrom: 'inventoryCategory',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({ name: `Endpoint Sports ${s.label}${seed}` }),
    updateBody: { name: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'inventory-items',
    basePath: '/api/v1/inventory/items',
    idFrom: 'inventoryItem',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({
      name: `Endpoint Football ${s.label}${seed}`,
      categoryId: s.ids.inventoryCategory,
    }),
    updateBody: { name: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'inventory-movements',
    basePath: '/api/v1/inventory/movements',
    idFrom: 'inventoryMovement',
    // Append-only ledger: list is the only surface. Writes go through
    // /inventory/items/:id/movements, probed in test/school-modules.test.ts.
    supports: { list: true },
  },
{
    name: 'fee-heads',
    basePath: '/api/v1/fees/heads',
    idFrom: 'feeHead',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({ name: `Endpoint Lab ${s.label}${seed}`, code: `LB${token(s.label, seed)}`.slice(0, 12) }),
    updateBody: { name: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'fee-structures',
    basePath: '/api/v1/fees/structures',
    idFrom: 'feeStructure',
    // Create is one-per-class-per-session, and the fixture's class already has one:
    // covered in test/finance-modules.test.ts instead.
    supports: { list: true, get: true, patch: true, remove: true },
    updateBody: { name: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'fee-concessions',
    basePath: '/api/v1/fees/concessions',
    idFrom: 'feeConcession',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({ studentId: s.ids.student, name: `Endpoint merit ${s.label}${seed}`, type: 'PERCENT', value: 5 }),
    updateBody: { name: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'fee-invoices',
    basePath: '/api/v1/fees/invoices',
    idFrom: 'feeInvoice',
    supports: { list: true, get: true, create: true },
    createBody: (s, seed) => ({
      studentId: s.ids.student,
      lines: [{ name: `Admission ${seed}`.slice(0, 80), amountMinor: 5000 }],
      periodLabel: 'Admission',
      dueDate: '2030-01-01T00:00:00.000Z',
    }),
  },
  {
    name: 'fee-payments',
    basePath: '/api/v1/fees/payments',
    idFrom: 'feePayment',
    supports: { list: true, get: true, create: true },
    // The fixture's invoice is open, so a small payment against it is valid.
    createBody: (s) => ({ studentId: s.ids.student, amountMinor: 100, method: 'CASH' }),
  },
  {
    name: 'fee-defaulters',
    basePath: '/api/v1/fees/defaulters',
    idFrom: 'feeInvoice',
    supports: { list: true },
  },
  {
    name: 'payroll-components',
    basePath: '/api/v1/payroll/components',
    idFrom: 'salaryComponent',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({
      name: `Endpoint medical ${s.label}${seed}`,
      code: `MD${token(s.label, seed)}`.slice(0, 12),
      type: 'EARNING',
      calculation: 'FIXED',
      defaultValue: 100,
    }),
    updateBody: { name: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'payroll-structures',
    basePath: '/api/v1/payroll/structures',
    idFrom: 'salaryStructure',
    // Create is one-per-employee, and the fixture's employee has one: see the finance test.
    supports: { list: true, get: true, patch: true, remove: true },
    updateBody: { bankName: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'payroll-advances',
    basePath: '/api/v1/payroll/advances',
    idFrom: 'salaryAdvance',
    supports: { list: true, get: true, create: true, remove: true },
    createBody: (s) => ({ employeeId: s.ids.employee, amountMinor: 1000, installmentMinor: 100 }),
  },
  {
    name: 'payroll-runs',
    basePath: '/api/v1/payroll/runs',
    idFrom: 'payrollRun',
    supports: { list: true, get: true, create: true, remove: true },
    createBody: (s, seed) => ({ month: seedMonth(s.label, seed, 2039).replace(/^\d{4}/, '2039') }),
  },
  {
    name: 'payroll-staff',
    basePath: '/api/v1/payroll/staff',
    idFrom: 'employee',
    // GET /:id is one employee's pay: structure, advances and payslips.
    supports: { list: true, get: true },
  },
  {
    name: 'payslips',
    basePath: '/api/v1/payroll/payslips',
    idFrom: 'payslip',
    // A staff member's OWN payslips (/payroll/my-payslips) are covered in the finance test.
    supports: { get: true, patch: true },
    updateBody: { unpaidLeaveDays: 3 },
  },
  {
    name: 'finance-categories',
    basePath: '/api/v1/finance/categories',
    idFrom: 'financeCategory',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({ name: `Endpoint repairs ${s.label}${seed}`, type: 'EXPENSE' }),
    updateBody: { name: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'finance-entries',
    basePath: '/api/v1/finance/entries',
    idFrom: 'ledgerEntry',
    supports: { list: true, get: true, create: true },
    createBody: (s, seed) => ({
      type: 'EXPENSE',
      categoryId: s.ids.financeCategory,
      amountMinor: 100,
      date: '2026-01-01T00:00:00.000Z',
      description: `Endpoint expense ${seed}`.slice(0, 200),
    }),
  },
{
    name: 'exams',
    basePath: '/api/v1/exams',
    idFrom: 'exam',
    supports: { list: true, get: true, create: true, patch: true, remove: true },
    createBody: (s, seed) => ({
      name: `Endpoint exam ${s.label}${seed}`,
      academicSessionId: s.ids.academicSession,
      startDate: '2025-06-01T00:00:00.000Z',
      endDate: '2025-06-05T00:00:00.000Z',
    }),
    updateBody: { description: 'HIJACKED OVER HTTP' },
  },
  {
    name: 'exam-papers',
    basePath: '/api/v1/exams/papers',
    idFrom: 'examPaper',
    // Papers are created through POST /exams/{id}/papers — covered in test/exams-modules.test.ts.
    supports: { list: true, get: true, patch: true, remove: true },
    updateBody: { startTime: '23:59' },
  },
  {
    name: 'exam-results',
    basePath: '/api/v1/exams/results',
    idFrom: 'examResult',
    // Results are written only by publishing — see test/exams-modules.test.ts.
    supports: { list: true, get: true },
  },
];
