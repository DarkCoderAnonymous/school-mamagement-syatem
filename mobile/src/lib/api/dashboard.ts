import { apiGet } from './http';
import type { AttendanceCounts } from './types';

/** GET /dashboard/summary — each block is null unless the caller can read it (backend/src/modules/dashboard). */
export interface DashboardSummary {
  currentSession: { _id: string; name: string; startDate: string; endDate: string } | null;
  students: { active: number; female: number; male: number; admittedLast30Days: number } | null;
  teachers: { total: number } | null;
  academics: { classes: number; sections: number; subjects: number } | null;
  fees: {
    billedMinor: number;
    collectedMinor: number;
    outstandingMinor: number;
    overdueMinor: number;
    defaulterCount: number;
    collectedTodayMinor: number;
    collectedThisMonthMinor: number;
    sessionName: string | null;
  } | null;
  attendance: {
    date: string;
    dayOff: string | null;
    students: number;
    sections: number;
    registersTaken: number;
    counts: AttendanceCounts;
    marked: number;
    rate: number | null;
  } | null;
  staffAttendance: { date: string; dayOff: string | null; onRegister: number; marked: number; counts: Record<'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE' | 'UNPAID_LEAVE', number> } | null;
}

export const getDashboard = () => apiGet<DashboardSummary>('/dashboard/summary');
