// Mirrors the backend's lean() document shapes (Mongo docs serialized to
// JSON over the wire — _id/refs are strings, dates are ISO strings).

export type RegistrationStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
export type SchoolStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'CANCELLED';

export interface Plan {
  _id: string;
  name: string;
  code: string;
  description?: string;
  priceMinor: number;
  currency: string;
  billingCycle: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  limits: { students: number; staff: number; storageMb: number; smsCredits: number };
  enabledModules: string[];
  features: string[];
  isActive: boolean;
}

export interface SchoolRegistration {
  _id: string;
  schoolName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  country?: string;
  curriculum?: string;
  /** Older applications predate the picker and have the default. */
  currency?: string;
  expectedStudents?: number;
  requestedPlanId: string;
  status: RegistrationStatus;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  schoolId?: string | null;
  createdAt: string;
}

export interface RegistrationStatusResult {
  schoolName: string;
  status: RegistrationStatus;
  reviewNotes?: string;
  submittedAt: string;
  reviewedAt?: string | null;
}

export interface School {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  /** ISO 4217; every amount the school records is in this. */
  currency?: string;
  status: SchoolStatus;
  createdAt: string;
  subscription?: { _id: string; status: SubscriptionStatus; planId: string } | null;
  userCount?: number;
}

export interface ApproveRegistrationResult {
  school: School;
  /** Null when the admin already had an account: their password is left alone. */
  tempPassword: string | null;
  adminEmail: string;
}

export interface AcademicSession {
  _id: string;
  schoolId: string;
  name: string;
  /** ISO date string (stored UTC). */
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── School modules ────────────────────────────────────────────────────────

/** A populated reference: the API returns the referenced doc in place of the id, or null if it's gone. */
export type Ref<T> = T | null;

export interface PersonName {
  _id: string;
  firstName: string;
  lastName: string;
}

export interface Section {
  _id: string;
  schoolId: string;
  name: string;
  classId: string | Ref<{ _id: string; name: string; order?: number }>;
  classTeacherId: Ref<{ _id: string; employeeId: Ref<PersonName & { employeeNumber: string }> }>;
  capacity: number;
  room?: string;
  studentCount: number;
}

export interface SchoolClass {
  _id: string;
  schoolId: string;
  name: string;
  order: number;
  academicSessionId: string | Ref<{ _id: string; name: string; isCurrent: boolean }>;
  sections: Section[];
  studentCount: number;
  capacity: number;
  createdAt: string;
}

export interface Subject {
  _id: string;
  schoolId: string;
  name: string;
  code: string;
  isElective: boolean;
  description?: string;
  teacherCount: number;
}

export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';

export interface Employee {
  _id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  designation: string;
  department?: string;
  joiningDate: string;
  status: EmployeeStatus;
}

export interface Teacher {
  _id: string;
  schoolId: string;
  employee: Employee;
  subjects: { _id: string; name: string; code: string }[];
  subjectIds: string[];
  qualification?: string;
  specialization?: string;
  experienceYears: number;
  createdAt: string;
}

export interface TeacherDetail extends Teacher {
  classTeacherOf: { _id: string; name: string; classId: Ref<{ _id: string; name: string }> }[];
  account: {
    email: string;
    accessStatus: 'INVITED' | 'ACTIVE' | 'DISABLED';
    lastLoginAt: string | null;
    pendingFirstSignIn: boolean;
  } | null;
}

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'GRADUATED' | 'TRANSFERRED';
export type GuardianRelation = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER';

export interface Guardian {
  _id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  occupation?: string;
  address?: string;
  userId?: string | null;
  children?: { _id: string; firstName: string; lastName: string; admissionNumber: string }[];
}

export interface Student {
  _id: string;
  schoolId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  classId: Ref<{ _id: string; name: string; order?: number }>;
  sectionId: Ref<{ _id: string; name: string; room?: string }>;
  academicSessionId?: Ref<{ _id: string; name: string; isCurrent: boolean }> | string;
  guardians: { guardianId: Ref<Guardian>; relation: GuardianRelation; isPrimary: boolean }[];
  rollNumber?: string;
  admissionDate: string;
  address?: string;
  bloodGroup?: string;
  previousSchool?: string;
  status: StudentStatus;
  createdAt: string;
}

export interface SchoolRole {
  _id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  isFamilyRole: boolean;
  permissions: string[];
  memberCount: number;
}

export interface PermissionModule {
  module: string;
  label: string;
  permissions: { code: string; description: string }[];
}

export interface Member {
  _id: string;
  schoolId: string;
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  roles: { _id: string; name: string }[];
  roleIds: string[];
  user: Ref<{
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    status: string;
    lastLoginAt?: string | null;
    mustChangePassword: boolean;
  }>;
  teacherId?: string | null;
  /** Their staff record here — only on the single-member read, and null until they're on the register/payroll. */
  employee?: Pick<Employee, '_id' | 'employeeNumber' | 'designation' | 'department' | 'joiningDate' | 'status'> | null;
  createdAt: string;
}

/** A teacher's sections in one session: class-teacher sections and those they teach a subject in. */
export interface TeacherClasses {
  academicSession: { _id: string; name: string; isCurrent: boolean; startDate: string; endDate: string } | null;
  sections: {
    section: { _id: string; name: string };
    class: { _id: string; name: string; order?: number };
    isClassTeacher: boolean;
    subjects: { _id: string; name: string; code?: string; assignmentId: string }[];
    /** Active students on the section's roll. */
    studentCount: number;
  }[];
}

export type InventoryUnit =
  'PIECE' | 'BOX' | 'PACK' | 'SET' | 'REAM' | 'KG' | 'LITRE' | 'METRE' | 'PAIR';
export type MovementType = 'RECEIVE' | 'ISSUE' | 'RETURN' | 'WRITE_OFF' | 'ADJUST';

export interface InventoryCategory {
  _id: string;
  schoolId: string;
  name: string;
  description?: string;
  itemCount: number;
}

export interface InventoryItem {
  _id: string;
  schoolId: string;
  name: string;
  sku: string;
  categoryId: Ref<{ _id: string; name: string }>;
  unit: InventoryUnit;
  quantityOnHand: number;
  reorderLevel: number;
  unitCostMinor: number;
  location?: string;
  description?: string;
  createdAt: string;
}

export interface InventoryMovement {
  _id: string;
  schoolId: string;
  itemId: Ref<{ _id: string; name: string; sku: string; unit: InventoryUnit }> | string;
  type: MovementType;
  quantityChange: number;
  balanceAfter: number;
  unitCostMinor?: number;
  party?: string;
  reference?: string;
  note?: string;
  occurredAt: string;
  recordedByUserId: Ref<PersonName>;
}

export interface InventorySummary {
  itemCount: number;
  stockValueMinor: number;
  outOfStockCount: number;
  lowStockCount: number;
  categoryCount: number;
  movementsLast30Days: number;
  lowStockItems: Pick<
    InventoryItem,
    '_id' | 'name' | 'sku' | 'unit' | 'quantityOnHand' | 'reorderLevel'
  >[];
}

export interface DashboardSummary {
  currentSession: { _id: string; name: string; startDate: string; endDate: string } | null;
  students: { active: number; female: number; male: number; admittedLast30Days: number } | null;
  teachers: { total: number } | null;
  academics: { classes: number; sections: number; subjects: number } | null;
  inventory: InventorySummary | null;
  fees: FeeSummary | null;
  /** Today's student registers across the current session; null without attendance.read. */
  attendance: {
    date: string;
    dayOff: string | null;
    students: number;
    sections: number;
    registersTaken: number;
    counts: AttendanceCounts;
    marked: number;
    /** Present + late over marked; null when nothing's marked yet. */
    rate: number | null;
    /** Last school days, oldest first, today last. */
    trend: { date: string; rate: number | null; marked: number }[];
  } | null;
  /** Today's staff register; null without staff.attendance.read. */
  staffAttendance: {
    date: string;
    dayOff: string | null;
    onRegister: number;
    counts: StaffAttendanceCounts;
    marked: number;
  } | null;
}

// ─── Fees ──────────────────────────────────────────────────────────────────

export type FeeFrequency = 'MONTHLY' | 'TERM' | 'ANNUAL' | 'ONE_TIME';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'ONLINE';
export type InvoiceStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export interface FeeHead {
  _id: string;
  schoolId: string;
  name: string;
  code: string;
  frequency: FeeFrequency;
  description?: string;
}

export interface FeeStructure {
  _id: string;
  schoolId: string;
  name: string;
  classId: Ref<{ _id: string; name: string; order?: number }>;
  academicSessionId: Ref<{ _id: string; name: string; isCurrent: boolean }>;
  items: {
    feeHeadId: Ref<Pick<FeeHead, '_id' | 'name' | 'code' | 'frequency'>>;
    amountMinor: number;
  }[];
  totalMinor: number;
}

export interface FeeSettings {
  lateFineType: 'NONE' | 'FLAT' | 'PER_DAY';
  lateFineAmountMinor: number;
  graceDays: number;
  maxFineMinor: number;
  invoicePrefix: string;
  receiptPrefix: string;
  currency: string;
  timezone: string;
}

export interface FeeConcession {
  _id: string;
  schoolId: string;
  studentId: Ref<{
    _id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    classId: Ref<{ _id: string; name: string }>;
  }>;
  name: string;
  kind: 'DISCOUNT' | 'SCHOLARSHIP' | 'SIBLING';
  type: 'PERCENT' | 'FIXED';
  value: number;
  feeHeadId: Ref<{ _id: string; name: string; code?: string }>;
  isActive: boolean;
  notes?: string;
}

export interface FeeInvoice {
  _id: string;
  schoolId: string;
  invoiceNumber: string;
  studentId: Ref<{
    _id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    rollNumber?: string;
    guardians?: Student['guardians'];
  }>;
  classId: Ref<{ _id: string; name: string }>;
  sectionId: Ref<{ _id: string; name: string }>;
  periodKey: string;
  periodLabel: string;
  issueDate: string;
  dueDate: string;
  lines: {
    feeHeadId?: string | null;
    name: string;
    amountMinor: number;
    concessionMinor: number;
  }[];
  concessions: { name: string; amountMinor: number }[];
  subtotalMinor: number;
  concessionMinor: number;
  discountMinor: number;
  fineMinor: number;
  lateFineMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  isOverdue: boolean;
  status: InvoiceStatus;
  adjustments: {
    type: 'DISCOUNT' | 'FINE';
    amountMinor: number;
    reason: string;
    at: string;
    byUserId: Ref<PersonName>;
  }[];
  cancelledAt: string | null;
  cancelReason?: string;
  lastReminderAt: string | null;
}

export interface FeeInvoiceDetail extends FeeInvoice {
  payments: {
    _id: string;
    receiptNumber: string;
    paidAt: string;
    method: PaymentMethod;
    status: 'COMPLETED' | 'REVERSED';
    appliedMinor: number;
    refundedMinor: number;
  }[];
  currency: string;
}

export interface FeePayment {
  _id: string;
  schoolId: string;
  receiptNumber: string;
  studentId: Ref<{
    _id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    classId?: Ref<{ _id: string; name: string }>;
    sectionId?: Ref<{ _id: string; name: string }>;
  }>;
  allocations: {
    invoiceId: Ref<{
      _id: string;
      invoiceNumber: string;
      periodLabel: string;
      totalMinor: number;
      paidMinor: number;
      status: InvoiceStatus;
    }>;
    amountMinor: number;
    refundedMinor: number;
  }[];
  amountMinor: number;
  netMinor: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  paidAt: string;
  receivedByUserId: Ref<PersonName>;
  status: 'COMPLETED' | 'REVERSED';
  refundedMinor: number;
  refunds: {
    amountMinor: number;
    reason: string;
    method: PaymentMethod;
    at: string;
    byUserId: Ref<PersonName>;
  }[];
  reversedAt: string | null;
  reversedByUserId: Ref<PersonName>;
  reversalReason?: string;
  currency?: string;
  schoolName?: string;
}

export interface StudentDues {
  student: Student;
  invoices: FeeInvoice[];
  totalDueMinor: number;
  overdueMinor: number;
  recentPayments: FeePayment[];
  concessions: FeeConcession[];
  currency: string;
}

export interface GenerationPreview {
  classes: {
    classId: string;
    className: string;
    students: number;
    toBill: number;
    alreadyBilled: number;
    skippedReason: string | null;
    lines: { name: string; amountMinor: number }[];
    totalMinor: number;
  }[];
  invoiceCount: number;
  totalMinor: number;
}

export interface Defaulter {
  _id: string;
  schoolId: string;
  student: {
    _id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    classId: Ref<{ _id: string; name: string }>;
    sectionId: Ref<{ _id: string; name: string }>;
  } | null;
  primaryContact: {
    _id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  } | null;
  overdueMinor: number;
  invoiceCount: number;
  oldestDueDate: string;
  daysOverdue: number;
}

export interface CollectionsReport {
  from: string;
  to: string;
  totalMinor: number;
  paymentCount: number;
  byMethod: { method: PaymentMethod; amountMinor: number; count: number }[];
  byDay: { date: string; amountMinor: number; count: number }[];
  payments: FeePayment[];
  currency: string;
}

export interface FeeSummary {
  sessionName: string | null;
  invoiceCount: number;
  billedMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  overdueInvoiceCount: number;
  defaulterCount: number;
  collectedTodayMinor: number;
  collectedThisMonthMinor: number;
  /** Net collections for the last six months, oldest first, this month last. */
  monthlyCollections?: { month: string; amountMinor: number }[];
  currency: string;
}

// ─── Payroll ───────────────────────────────────────────────────────────────

export type ComponentCalculation = 'FIXED' | 'PERCENT_OF_BASIC' | 'PERCENT_OF_GROSS';
export type PayrollStatus = 'DRAFT' | 'LOCKED' | 'PUBLISHED';

export interface SalaryComponent {
  _id: string;
  schoolId: string;
  name: string;
  code: string;
  type: 'EARNING' | 'DEDUCTION';
  calculation: ComponentCalculation;
  defaultValue: number;
  isActive: boolean;
}

export interface SalaryStructure {
  _id: string;
  schoolId: string;
  employeeId: string;
  basicMinor: number;
  components: { componentId: string; value: number }[];
  bankName?: string;
  accountTitle?: string;
  accountNumber?: string;
  effectiveFrom: string;
}

export interface PayrollStaff extends Employee {
  schoolId: string;
  structure: SalaryStructure | null;
  monthlyGrossMinor: number | null;
  monthlyNetMinor: number | null;
}

/** One employee's pay for their staff profile: structure, a full month's figures, open advances and a year of payslips. */
export interface StaffPay {
  currency: string;
  employee: Pick<Employee, '_id' | 'firstName' | 'lastName' | 'employeeNumber' | 'designation' | 'department' | 'joiningDate' | 'status'>;
  structure: {
    _id: string;
    effectiveFrom: string;
    bankName: string | null;
    accountTitle: string | null;
    accountNumber: string | null;
  } | null;
  monthly: {
    basicMinor: number;
    earnings: PayslipLine[];
    deductions: PayslipLine[];
    grossMinor: number;
    totalDeductionsMinor: number;
    netMinor: number;
  } | null;
  advances: {
    _id: string;
    amountMinor: number;
    installmentMinor: number;
    recoveredMinor: number;
    outstandingMinor: number;
    reason?: string;
    issuedAt: string;
  }[];
  year: number;
  years: number[];
  payslips: Pick<
    Payslip,
    '_id' | 'payrollRunId' | 'month' | 'status' | 'basicMinor' | 'grossMinor' | 'totalDeductionsMinor' | 'netMinor' | 'unpaidLeaveDays'
  >[];
  yearTotals: { payslips: number; grossMinor: number; totalDeductionsMinor: number; netMinor: number; unpaidLeaveDays: number };
}

export interface PayrollCandidate {
  membershipId: string;
  user: { _id: string; firstName: string; lastName: string; email: string };
  roles: string[];
}

export interface SalaryAdvance {
  _id: string;
  schoolId: string;
  employeeId: Ref<{ _id: string; firstName: string; lastName: string; employeeNumber: string }>;
  amountMinor: number;
  installmentMinor: number;
  recoveredMinor: number;
  outstandingMinor: number;
  reason?: string;
  issuedAt: string;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
}

export interface PayslipLine {
  code?: string;
  name: string;
  amountMinor: number;
}

export interface Payslip {
  _id: string;
  schoolId: string;
  payrollRunId: string;
  employeeId: string;
  month: string;
  status: PayrollStatus;
  employee: { name: string; employeeNumber: string; designation?: string; department?: string };
  bank: { bankName?: string; accountTitle?: string; accountNumber?: string };
  daysInMonth: number;
  basicMinor: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  unpaidLeaveDays: number;
  unpaidLeaveDeductionMinor: number;
  /** What the staff register said when the draft was built. */
  attendanceUnpaidDays?: number;
  /** True once the unpaid days were set by hand; recalculating keeps them. */
  unpaidLeaveOverridden?: boolean;
  advanceRecoveries: { advanceId: string; amountMinor: number }[];
  adjustments: { label: string; amountMinor: number }[];
  grossMinor: number;
  totalDeductionsMinor: number;
  netMinor: number;
  currency?: string;
  schoolName?: string;
}

export interface PayrollRun {
  _id: string;
  schoolId: string;
  month: string;
  status: PayrollStatus;
  employeeCount: number;
  grossMinor: number;
  deductionsMinor: number;
  netMinor: number;
  notes?: string;
  lockedAt: string | null;
  lockedByUserId?: Ref<PersonName>;
  publishedAt: string | null;
  publishedByUserId?: Ref<PersonName>;
  createdAt: string;
}

export interface PayrollRunDetail extends PayrollRun {
  payslips: Payslip[];
  currency: string;
  missingStructures?: {
    _id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
  }[];
}

// ─── Finance ledger ────────────────────────────────────────────────────────

export type LedgerType = 'EXPENSE' | 'INCOME';

export interface FinanceCategory {
  _id: string;
  schoolId: string;
  name: string;
  type: LedgerType;
  isSystem: boolean;
}

export interface LedgerEntry {
  _id: string;
  schoolId: string;
  type: LedgerType;
  categoryId: Ref<{ _id: string; name: string; type: LedgerType; isSystem: boolean }>;
  amountMinor: number;
  date: string;
  description: string;
  party?: string;
  method: PaymentMethod;
  reference?: string;
  recordedByUserId: Ref<PersonName>;
  source: 'MANUAL' | 'PAYROLL';
  voidedAt: string | null;
  voidedByUserId: Ref<PersonName>;
  voidReason?: string;
}

export interface FinanceSummary {
  months: {
    month: string;
    feeIncomeMinor: number;
    otherIncomeMinor: number;
    expenseMinor: number;
    netMinor: number;
  }[];
  totals: {
    feeIncomeMinor: number;
    otherIncomeMinor: number;
    expenseMinor: number;
    netMinor: number;
  };
  byCategory: { categoryId: string; name: string; type: LedgerType; amountMinor: number }[];
  currency: string;
}

// ─── Exams & results ───────────────────────────────────────────────────────

export type ExamType = 'UNIT_TEST' | 'MIDTERM' | 'FINAL' | 'MOCK' | 'OTHER';
export type PaperStatus = 'OPEN' | 'SUBMITTED' | 'VERIFIED' | 'PUBLISHED';
export type ExamStatus = 'SETUP' | 'IN_PROGRESS' | 'PARTLY_PUBLISHED' | 'PUBLISHED';

export interface GradingBand {
  grade: string;
  minPercent: number;
  remark?: string;
}

export interface ExamSettings {
  gradingBands: GradingBand[];
  showPositions: boolean;
}

export interface Exam {
  _id: string;
  schoolId: string;
  name: string;
  type: ExamType;
  academicSessionId: Ref<{ _id: string; name: string }>;
  startDate: string;
  endDate: string;
  description?: string;
  status: ExamStatus;
  paperCounts: Partial<Record<PaperStatus, number>>;
  paperTotal?: number;
}

export interface ExamPaper {
  _id: string;
  schoolId: string;
  examId: Ref<{ _id: string; name: string; type?: ExamType; startDate?: string; endDate?: string }>;
  classId: Ref<{ _id: string; name: string; order?: number }>;
  subjectId: Ref<{ _id: string; name: string; code: string }>;
  date: string | null;
  startTime?: string;
  durationMinutes?: number;
  maxMarks: number;
  passMarks: number;
  status: PaperStatus;
  submittedAt: string | null;
  submittedByUserId?: Ref<PersonName>;
  verifiedAt: string | null;
  verifiedByUserId?: Ref<PersonName>;
  returnReason?: string;
  publishedAt: string | null;
  marksEntered?: number;
  classStrength?: number;
}

export interface ExamDetail extends Exam {
  papers: ExamPaper[];
}

export interface MarksRow {
  student: {
    _id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    rollNumber?: string;
    sectionId: string;
  };
  marksObtained: number | null;
  isAbsent: boolean;
  remarks: string;
  updatedAt: string | null;
}

export interface MarksSheet {
  paper: ExamPaper;
  sections: { _id: string; name: string }[];
  canEdit: boolean;
  enteredCount: number;
  classStrength: number;
  rows: MarksRow[];
}

/** A class card on the marks-entry board. */
export interface MarksBoardClass {
  _id: string;
  name: string;
  order: number;
  sections: { _id: string; name: string }[];
  students: number;
  papers: number;
  totalMax: number;
  marksEntered: number;
  marksExpected: number;
  statusCounts: Partial<Record<PaperStatus, number>>;
  yourPapers: number;
}

export interface MarksBoard {
  exam: { _id: string; name: string; type: ExamType; startDate: string; endDate: string };
  classes: MarksBoardClass[];
}

export interface ClassSheetPaper {
  _id: string;
  subject: { _id: string; name: string; code?: string };
  date: string | null;
  startTime?: string;
  maxMarks: number;
  passMarks: number;
  status: PaperStatus;
  canEdit: boolean;
}

export interface StudentMark {
  marksObtained: number | null;
  isAbsent: boolean;
  remarks: string;
}

export interface ClassSheetRow {
  student: MarksRow['student'];
  /** examPaperId → mark; a paper with no entry yet is absent from the map. */
  marks: Record<string, StudentMark>;
  entered: number;
  totalObtained: number;
  totalMax: number;
  percentage: number;
}

/** A class's award list: every paper × every student, with totals. */
export interface ClassSheet {
  exam: MarksBoard['exam'];
  class: { _id: string; name: string };
  sections: { _id: string; name: string }[];
  papers: ClassSheetPaper[];
  totalMax: number;
  rows: ClassSheetRow[];
}

export interface SubjectResult {
  subjectId?: string;
  name: string;
  code?: string;
  maxMarks: number;
  passMarks: number;
  marksObtained: number | null;
  isAbsent: boolean;
  percentage: number;
  grade: string;
  passed: boolean;
  remarks?: string;
}

export interface ExamResult {
  _id: string;
  schoolId: string;
  examId: string;
  studentId: string;
  classId: string;
  sectionId: string | null;
  student: { name: string; admissionNumber: string; rollNumber?: string };
  examName: string;
  className: string;
  sectionName?: string;
  subjects: SubjectResult[];
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  remark?: string;
  result: 'PASS' | 'FAIL';
  classRank: number | null;
  sectionRank: number | null;
  classSize: number;
  /** The scale these grades were given with (absent on results published before it was stored). */
  gradingBands?: GradingBand[];
  publishedAt: string;
}

export interface ReportCardData extends ExamResult {
  exam: {
    name: string;
    type: ExamType;
    startDate: string;
    endDate: string;
    academicSessionId?: Ref<{ _id: string; name: string }>;
  } | null;
  school: { name: string; address?: string; logoUrl: string | null };
  guardian: { firstName: string; lastName: string; phone: string } | null;
  dateOfBirth: string | null;
  gradingBands: GradingBand[];
  showPositions: boolean;
}

export interface ExamAnalysis {
  examName: string;
  students: number;
  passed: number;
  passPercent: number;
  averagePercent: number;
  highestPercent: number;
  lowestPercent: number;
  subjects: {
    name: string;
    students: number;
    passed: number;
    absent: number;
    passPercent: number;
    averagePercent: number;
    highestPercent: number;
  }[];
  grades: { grade: string; count: number }[];
  classes: {
    classId: string;
    className: string;
    students: number;
    passPercent: number;
    averagePercent: number;
  }[];
  toppers: Pick<
    ExamResult,
    '_id' | 'studentId' | 'student' | 'className' | 'sectionName' | 'percentage' | 'grade' | 'classRank'
  >[];
}

// ─── Teaching assignments & attendance ───────────────────────────────────────

export interface TeachingAssignment {
  _id: string;
  schoolId: string;
  teacherId: Ref<{
    _id: string;
    employeeId: Ref<PersonName & { _id: string; employeeNumber: string }>;
  }>;
  classId: Ref<{ _id: string; name: string; order: number }>;
  sectionId: Ref<{ _id: string; name: string }>;
  subjectId: Ref<{ _id: string; name: string; code: string }>;
  academicSessionId: string;
}

export interface MyClasses {
  sections: {
    section: { _id: string; name: string };
    class: { _id: string; name: string };
    isClassTeacher: boolean;
    subjects: { _id: string; name: string; code: string }[];
  }[];
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';
export type AttendanceCounts = Record<AttendanceStatus, number>;

/** Marks counted over the days a register was taken; % is present + late over those (null when none). */
export interface AttendanceTotals {
  counts: AttendanceCounts;
  marked: number;
  percentage: number | null;
}

/** One student's month, day by day (backend attendance.service `getStudentAttendance`). */
export interface StudentAttendance {
  month: string;
  /** The school's today, YYYY-MM-DD. */
  today: string;
  days: {
    date: string;
    weekday: number;
    dayOff: string | null;
    isFuture: boolean;
    status: AttendanceStatus | null;
    remark: string | null;
  }[];
  schoolDays: number;
  monthTotals: AttendanceTotals;
  /** Across the student's current session. */
  sessionTotals: AttendanceTotals;
}

export interface AttendanceBoard {
  /** YYYY-MM-DD */
  date: string;
  today: string;
  timezone: string;
  /** Why this day has no register (a holiday's name, "Sunday is a day off"), or null on a school day. */
  dayOff: string | null;
  /** Earliest day this user may take a register for; null for the office (any day). */
  earliestEditable: string | null;
  /** The user's own registers left unfinished on earlier days they can still take. */
  missed: {
    date: string;
    section: { _id: string; name: string };
    class: { _id: string; name: string };
    marked: number;
    students: number;
  }[];
  sections: {
    _id: string;
    name: string;
    class: { _id: string; name: string };
    students: number;
    marked: number;
    counts: AttendanceCounts;
    isMine: boolean;
    canMark: boolean;
  }[];
}

export interface AttendanceRegister {
  date: string;
  today: string;
  dayOff: string | null;
  earliestEditable: string | null;
  section: { _id: string; name: string };
  class: { _id: string; name: string };
  classTeacher: string | null;
  canEdit: boolean;
  readOnlyReason: string | null;
  counts: AttendanceCounts;
  marked: number;
  lastMarked: { at: string; by: string | null } | null;
  rows: {
    student: {
      _id: string;
      firstName: string;
      lastName: string;
      admissionNumber: string;
      rollNumber?: string;
    };
    status: AttendanceStatus | null;
    remark: string;
  }[];
}

export interface AttendanceSettings {
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOffDays: number[];
  teacherBackdateDays: number;
}

export interface Holiday {
  _id: string;
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export type StaffAttendanceStatus =
  'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE' | 'UNPAID_LEAVE';
export type StaffAttendanceCounts = Record<StaffAttendanceStatus, number>;

export interface StaffRegister {
  date: string;
  today: string;
  dayOff: string | null;
  canEdit: boolean;
  readOnlyReason: string | null;
  counts: StaffAttendanceCounts;
  marked: number;
  lastMarked: { at: string; by: string | null } | null;
  rows: {
    employee: {
      _id: string;
      firstName: string;
      lastName: string;
      employeeNumber: string;
      designation: string;
      department?: string;
      status: EmployeeStatus;
    };
    status: StaffAttendanceStatus | null;
    remark: string;
  }[];
}

/** One employee's month day by day, as their staff profile shows it. */
export interface EmployeeAttendance {
  month: string;
  today: string;
  employee: Pick<Employee, '_id' | 'firstName' | 'lastName' | 'employeeNumber' | 'designation' | 'joiningDate' | 'status'>;
  days: {
    date: string;
    /** 0 = Sunday. */
    weekday: number;
    dayOff: string | null;
    isFuture: boolean;
    beforeJoining: boolean;
    status: StaffAttendanceStatus | null;
    remark: string | null;
  }[];
  schoolDays: number;
  monthTotals: StaffAttendanceTotals;
  yearTotals: StaffAttendanceTotals & { year: number };
}

export interface StaffAttendanceTotals {
  counts: StaffAttendanceCounts;
  marked: number;
  unpaidDays: number;
  /** Present + late + ½ half days over days marked; null before any mark. */
  percentage: number | null;
}

export interface StaffMonthSummary {
  month: string;
  /** School days so far this month (days off excluded). */
  schoolDays: number;
  rows: {
    employee: {
      _id: string;
      firstName: string;
      lastName: string;
      employeeNumber: string;
      designation: string;
    };
    counts: StaffAttendanceCounts;
    marked: number;
    unpaidDays: number;
  }[];
}

export interface MonthlyRegister {
  month: string;
  section: { _id: string; name: string };
  class: { _id: string; name: string };
  classTeacher: string | null;
  schoolDays: number;
  registersTaken: number;
  days: {
    date: string;
    weekday: number;
    dayOff: string | null;
    isFuture: boolean;
    counts: AttendanceCounts;
  }[];
  rows: {
    student: {
      _id: string;
      firstName: string;
      lastName: string;
      admissionNumber: string;
      rollNumber?: string;
    };
    current: boolean;
    marks: Record<string, AttendanceStatus>;
    counts: AttendanceCounts;
    marked: number;
    /** Present + late over days marked; null when never marked. */
    percentage: number | null;
  }[];
}
