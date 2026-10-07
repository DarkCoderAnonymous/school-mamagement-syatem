/**
 * A teacher's daily work outside the register: marks entry, their own
 * payslips, and the school calendar. Shapes mirror the backend services
 * (backend/src/modules/exams/marks.service, payroll.service `listMyPayslips`,
 * attendance/holidays.service) — the web's copies live in
 * frontend/src/lib/api/types.ts.
 */
import type { Paginated } from '@sms/shared';
import { apiDelete, apiGet, apiGetPaginated, apiPatch, apiPost, apiPut } from './http';

// ─── Marks entry ─────────────────────────────────────────────────────────────

export type PaperStatus = 'OPEN' | 'SUBMITTED' | 'VERIFIED' | 'PUBLISHED';

interface PersonRef {
  _id: string;
  firstName: string;
  lastName: string;
}

/** One class × subject in one exam. Populated refs are null if the record was since removed. */
export interface ExamPaper {
  _id: string;
  examId: { _id: string; name: string; type?: string; startDate?: string; endDate?: string } | null;
  classId: { _id: string; name: string } | null;
  subjectId: { _id: string; name: string; code?: string } | null;
  /** Calendar day at UTC midnight, if scheduled. */
  date: string | null;
  startTime?: string;
  durationMinutes?: number;
  maxMarks: number;
  passMarks: number;
  status: PaperStatus;
  submittedAt: string | null;
  submittedByUserId?: PersonRef | null;
  verifiedAt: string | null;
  verifiedByUserId?: PersonRef | null;
  /** The exam office's note when it sent the paper back to marks entry. */
  returnReason?: string;
  publishedAt: string | null;
  /** List endpoint only: students with a mark or marked absent, against the class's active roster. */
  marksEntered?: number;
  classStrength?: number;
}

export interface MarksRow {
  student: {
    _id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    rollNumber?: string;
    sectionId?: string;
  };
  marksObtained: number | null;
  isAbsent: boolean;
  remarks: string;
  updatedAt: string | null;
}

export interface MarksSheet {
  paper: ExamPaper;
  sections: { _id: string; name: string }[];
  /** OPEN and this person may enter this class + subject. */
  canEdit: boolean;
  enteredCount: number;
  classStrength: number;
  rows: MarksRow[];
}

export interface MarkEntry {
  studentId: string;
  /** Whole or half marks, 0..maxMarks; null clears the mark (and is stored for an absentee). */
  marksObtained: number | null;
  isAbsent: boolean;
  remarks?: string;
}

/** The server accepts at most this many entries per save. */
export const MAX_ENTRIES_PER_SAVE = 200;

/** Papers across exams, newest first. `mine` narrows to the class + subject pairs assigned to the caller. */
export const listPapers = (params: {
  page: number;
  mine?: boolean;
  status?: PaperStatus;
  limit?: number;
}): Promise<Paginated<ExamPaper>> =>
  apiGetPaginated<ExamPaper>('/exams/papers', {
    page: params.page,
    limit: params.limit ?? 20,
    mine: params.mine ? 'true' : undefined,
    status: params.status,
  });

/** One paper's whole-class roster with each student's mark (sections are filtered on the phone). */
export const getMarksSheet = (paperId: string) => apiGet<MarksSheet>(`/exams/papers/${paperId}`);

export const saveMarks = (paperId: string, entries: MarkEntry[]) =>
  apiPut<{ saved: number; enteredCount: number; savedAt: string }>(
    `/exams/papers/${paperId}/marks`,
    { entries },
  );

/** Rejected by the server while any student has no mark and isn't marked absent. */
export const submitPaper = (paperId: string) =>
  apiPost<ExamPaper>(`/exams/papers/${paperId}/submit`);

// ─── My payslips ─────────────────────────────────────────────────────────────

export interface PayslipLine {
  code?: string;
  name: string;
  amountMinor: number;
}

/** The list endpoint selects only these fields. Always PUBLISHED — drafts never reach the employee. */
export interface PayslipSummary {
  _id: string;
  /** "YYYY-MM" */
  month: string;
  status: string;
  employee: { name: string; employeeNumber: string; designation?: string; department?: string };
  grossMinor: number;
  totalDeductionsMinor: number;
  netMinor: number;
}

/** A payslip is a snapshot: every name and amount is copied at the moment payroll ran. */
export interface Payslip extends PayslipSummary {
  daysInMonth: number;
  basicMinor: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  unpaidLeaveDays: number;
  unpaidLeaveDeductionMinor: number;
  advanceRecoveries: { advanceId: string; amountMinor: number }[];
  /** Signed: positive adds to pay, negative takes away. */
  adjustments: { label: string; amountMinor: number }[];
  bank?: { bankName?: string; accountTitle?: string; accountNumber?: string };
  currency?: string;
  schoolName?: string;
}

export const listMyPayslips = (page: number) =>
  apiGetPaginated<PayslipSummary>('/payroll/my-payslips', { page, limit: 24 });
export const getMyPayslip = (id: string) => apiGet<Payslip>(`/payroll/my-payslips/${id}`);
/** Anyone's payslip, any status — the payroll office's read (`payroll.read`). */
export const getStaffPayslip = (id: string) => apiGet<Payslip>(`/payroll/payslips/${id}`);

// ─── School calendar ─────────────────────────────────────────────────────────

export interface AttendanceSettings {
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOffDays: number[];
  /** How many school days back a teacher may still take a missed register. */
  teacherBackdateDays: number;
}

export interface Holiday {
  _id: string;
  name: string;
  /** ISO instants at UTC midnight of the first and last day (inclusive). */
  startDate: string;
  endDate: string;
}

export const getAttendanceSettings = () => apiGet<AttendanceSettings>('/attendance/settings');

/** Holidays overlapping `from`..`to` (either optional, YYYY-MM-DD), earliest first. */
export const listHolidays = (params: {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}) =>
  apiGetPaginated<Holiday>('/attendance/holidays', {
    page: params.page ?? 1,
    limit: params.limit ?? 50,
    from: params.from,
    to: params.to,
  });

/**
 * One holiday by id, as the server has it — or null if this school has no such
 * holiday. There is no single-holiday endpoint, so it pages through the list.
 */
export async function findHoliday(id: string): Promise<Holiday | null> {
  for (let page = 1; ; page++) {
    const res = await listHolidays({ page, limit: 100 });
    const hit = res.items.find((h) => h._id === id);
    if (hit) return hit;
    if (res.meta.page >= res.meta.totalPages) return null;
  }
}

/** Days are "YYYY-MM-DD"; omit `endDate` for a one-day holiday. Needs `attendance.manage`. */
export interface HolidayInput {
  name: string;
  startDate: string;
  endDate?: string;
}
export const createHoliday = (input: HolidayInput) =>
  apiPost<Holiday>('/attendance/holidays', input);
export const updateHoliday = (id: string, input: HolidayInput) =>
  apiPatch<Holiday>(`/attendance/holidays/${id}`, input);
export const deleteHoliday = (id: string) => apiDelete(`/attendance/holidays/${id}`);
