import axios from 'axios';
import type { ApiResponse } from '@sms/shared';
import { apiClient } from '../api-client';
import { ApiRequestError, apiDelete, apiGet, apiGetPaginated, apiPut } from './http';

/**
 * Front office: students & guardians, the teacher/staff directory and the
 * daily staff register. Shapes mirror the backend services
 * (backend/src/modules/students, teachers, members, classes,
 * teaching-assignments, staff-attendance); the web's copies live in
 * frontend/src/lib/api/types.ts and school.ts.
 */

/** A populated reference: the referenced doc in place of the id, or null if it's gone. */
type Ref<T> = T | null;

// ─── Classes (pickers) ───────────────────────────────────────────────────────

export interface ClassSection {
  _id: string;
  name: string;
  capacity: number;
  studentCount: number;
  room?: string;
}

export interface SchoolClass {
  _id: string;
  name: string;
  order: number;
  sections: ClassSection[];
  studentCount: number;
}

/** Current-session classes with their sections — for the class/section pickers. */
export const listClassOptions = () => apiGetPaginated<SchoolClass>('/classes', { limit: 100 }).then((p) => p.items);

// ─── Students & guardians ────────────────────────────────────────────────────

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'GRADUATED' | 'TRANSFERRED';
export type GuardianRelation = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER';

export interface Guardian {
  _id: string;
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

export type GuardianLinkInput =
  | { guardianId: string; relation: GuardianRelation; isPrimary: boolean }
  | {
      firstName: string;
      lastName: string;
      phone: string;
      email?: string;
      occupation?: string;
      relation: GuardianRelation;
      isPrimary: boolean;
      createLogin?: boolean;
    };

export interface StudentInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  classId: string;
  sectionId: string;
  rollNumber?: string;
  admissionDate?: string;
  address?: string;
  bloodGroup?: string;
  previousSchool?: string;
  status?: StudentStatus;
  guardians: GuardianLinkInput[];
}

export interface StudentListFilters {
  search?: string;
  classId?: string;
  sectionId?: string;
  status?: StudentStatus;
}

export const listStudents = (page: number, filters: StudentListFilters) =>
  apiGetPaginated<Student>('/students', { page, limit: 25, sort: 'lastName', ...filters });
export const getStudent = (id: string) => apiGet<Student>(`/students/${id}`);
export const createStudent = (input: StudentInput) => sendForm<Student>('post', '/students', input);
export const updateStudent = (id: string, input: Partial<StudentInput>) => sendForm<Student>('patch', `/students/${id}`, input);
export const archiveStudent = (id: string) => apiDelete(`/students/${id}`);
export const searchGuardians = (search: string) => apiGetPaginated<Guardian>('/guardians', { search, limit: 8 });

// ─── Teachers & staff ────────────────────────────────────────────────────────

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
  employee: Employee;
  subjects: { _id: string; name: string; code: string }[];
  subjectIds: string[];
  qualification?: string;
  specialization?: string;
  experienceYears: number;
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

export interface Member {
  _id: string;
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  roles: { _id: string; name: string }[];
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
  /** Their staff record here — only on the single-member read; null until they're on the register/payroll. */
  employee?: Pick<Employee, '_id' | 'employeeNumber' | 'designation' | 'department' | 'joiningDate' | 'status'> | null;
  createdAt: string;
}

export const listTeachers = (page: number, search?: string) =>
  apiGetPaginated<Teacher>('/teachers', { page, limit: 25, search });
export const getTeacher = (id: string) => apiGet<TeacherDetail>(`/teachers/${id}`);
export const listMembers = (page: number, search?: string) =>
  apiGetPaginated<Member>('/members', { page, limit: 25, search });
export const getMember = (id: string) => apiGet<Member>(`/members/${id}`);

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
/** Omitting the session means the current one. */
export const getTeacherClasses = (teacherId: string, academicSessionId?: string) =>
  apiGet<TeacherClasses>(`/teaching-assignments/teachers/${teacherId}`, { academicSessionId });

export interface AcademicSessionOption {
  _id: string;
  name: string;
  isCurrent: boolean;
  startDate: string;
}
export const listAcademicSessionOptions = () =>
  apiGetPaginated<AcademicSessionOption>('/academic-sessions', { limit: 50, sort: '-startDate' }).then((p) => p.items);

// ─── Staff attendance ────────────────────────────────────────────────────────

export type StaffAttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE' | 'UNPAID_LEAVE';
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

export interface StaffMonthSummary {
  month: string;
  /** School days so far this month (days off excluded). */
  schoolDays: number;
  rows: {
    employee: { _id: string; firstName: string; lastName: string; employeeNumber: string; designation: string };
    counts: StaffAttendanceCounts;
    marked: number;
    unpaidDays: number;
  }[];
}

export const getStaffRegister = (date?: string) => apiGet<StaffRegister>('/staff-attendance/register', { date });
export const saveStaffRegister = (input: {
  date: string;
  entries: { employeeId: string; status: StaffAttendanceStatus; remark?: string }[];
}) => apiPut<StaffRegister>('/staff-attendance/register', input);
export const getStaffMonthSummary = (month: string) => apiGet<StaffMonthSummary>('/staff-attendance/summary', { month });

export interface StaffAttendanceTotals {
  counts: StaffAttendanceCounts;
  marked: number;
  unpaidDays: number;
  /** Present + late + ½ half days over days marked; null before any mark. */
  percentage: number | null;
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
/** `month` is YYYY-MM; omitted means the school's current month. */
export const getEmployeeAttendance = (employeeId: string, month?: string) =>
  apiGet<EmployeeAttendance>(`/staff-attendance/employees/${employeeId}`, { month });

// ─── Staff pay (the payroll office's view of one person) ─────────────────────

export type PayrollStatus = 'DRAFT' | 'LOCKED' | 'PUBLISHED';
export interface StaffPayLine {
  code?: string;
  name: string;
  amountMinor: number;
}

/** One employee's pay: structure, a full month's figures, open advances and a year of payslips. */
export interface StaffPay {
  currency: string;
  employee: Pick<Employee, '_id' | 'firstName' | 'lastName' | 'employeeNumber' | 'designation' | 'department' | 'joiningDate' | 'status'>;
  structure: { _id: string; effectiveFrom: string; bankName: string | null; accountTitle: string | null; accountNumber: string | null } | null;
  monthly: {
    basicMinor: number;
    earnings: StaffPayLine[];
    deductions: StaffPayLine[];
    grossMinor: number;
    totalDeductionsMinor: number;
    netMinor: number;
  } | null;
  advances: { _id: string; amountMinor: number; installmentMinor: number; recoveredMinor: number; outstandingMinor: number; reason?: string; issuedAt: string }[];
  year: number;
  years: number[];
  payslips: {
    _id: string;
    payrollRunId: string;
    month: string;
    status: PayrollStatus;
    basicMinor: number;
    grossMinor: number;
    totalDeductionsMinor: number;
    netMinor: number;
    unpaidLeaveDays: number;
  }[];
  yearTotals: { payslips: number; grossMinor: number; totalDeductionsMinor: number; netMinor: number; unpaidLeaveDays: number };
}
/** Their latest year of payslips when `year` is omitted. */
export const getStaffPay = (employeeId: string, year?: number) => apiGet<StaffPay>(`/payroll/staff/${employeeId}`, { year });

// ─── Form submissions that keep the server's error details ───────────────────

/**
 * The shared http helpers drop `error.details`; a form needs them to put a
 * rejection on the field that caused it (`details.field`, or Zod's
 * `details.fieldErrors`). Same envelope and error class otherwise.
 */
export class FormApiError extends ApiRequestError {
  details?: unknown;

  constructor(code: string, message: string, status?: number, details?: unknown) {
    super(code, message, status);
    this.name = 'FormApiError';
    this.details = details;
  }
}

async function sendForm<T>(method: 'post' | 'patch', url: string, body: unknown): Promise<T> {
  try {
    const res = await apiClient.request<ApiResponse<T>>({ method, url, data: body });
    if (!res.data.success) throw new FormApiError(res.data.error.code, res.data.error.message, res.status, res.data.error.details);
    return res.data.data;
  } catch (err) {
    if (err instanceof ApiRequestError) throw err;
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as ApiResponse<unknown> | undefined;
      if (data && data.success === false) throw new FormApiError(data.error.code, data.error.message, err.response?.status, data.error.details);
      throw new ApiRequestError('NETWORK_ERROR', 'Could not reach the server — check your connection', err.response?.status);
    }
    throw new ApiRequestError('UNKNOWN_ERROR', 'Something went wrong');
  }
}

/**
 * The server's per-field messages, keyed by field path ("sectionId",
 * "guardians", "guardians.0.guardianId"). Empty when the error names no field.
 */
export function serverFieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof FormApiError) || !err.details || typeof err.details !== 'object') return {};
  const details = err.details as { field?: unknown; fieldErrors?: unknown };
  const out: Record<string, string> = {};
  if (typeof details.field === 'string') out[details.field] = err.message;
  if (details.fieldErrors && typeof details.fieldErrors === 'object') {
    for (const [key, messages] of Object.entries(details.fieldErrors as Record<string, unknown>)) {
      if (Array.isArray(messages) && typeof messages[0] === 'string') out[key] = messages[0];
    }
  }
  return out;
}
