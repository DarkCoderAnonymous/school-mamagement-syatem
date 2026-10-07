import { apiGet, apiPut } from './http';
import type {
  AttendanceBoard,
  AttendanceCounts,
  AttendanceRegister,
  AttendanceStatus,
  MyClasses,
} from './types';

export const getMyClasses = () => apiGet<MyClasses>('/teaching-assignments/mine');

/** The day's registers for the sections this teacher leads or teaches in. */
export const getMyBoard = (date?: string) =>
  apiGet<AttendanceBoard>('/attendance/board', { mine: 'true', date });

/** The day's registers: the viewer's own sections (`mine`), or every section this session. */
export const getBoard = (date: string | undefined, mine: boolean) =>
  apiGet<AttendanceBoard>('/attendance/board', { mine: mine ? 'true' : undefined, date });

export const getRegister = (sectionId: string, date?: string) =>
  apiGet<AttendanceRegister>('/attendance/register', { sectionId, date });

export const saveRegister = (input: {
  sectionId: string;
  date: string;
  entries: { studentId: string; status: AttendanceStatus; remark?: string }[];
}) => apiPut<AttendanceRegister>('/attendance/register', input);

/** Marks counted over the days a register was taken; % is present + late over those (null when none). */
export interface AttendanceTotals {
  counts: AttendanceCounts;
  marked: number;
  percentage: number | null;
}

/** One student's month, day by day (backend attendance.service `getStudentAttendance`). */
export interface StudentAttendance {
  month: string;
  /** The school's today, "YYYY-MM-DD". */
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

/** `month` is "YYYY-MM"; omitted means the school's current month. */
export const getStudentAttendance = (studentId: string, month?: string) =>
  apiGet<StudentAttendance>(`/attendance/students/${studentId}`, { month });
