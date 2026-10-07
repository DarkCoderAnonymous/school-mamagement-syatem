/**
 * Response shapes the mobile app reads. They mirror the backend services
 * (backend/src/modules/attendance, teaching-assignments) — the web's copies
 * live in frontend/src/lib/api/types.ts.
 */

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';
export type AttendanceCounts = Record<AttendanceStatus, number>;

export interface MyClasses {
  sections: {
    section: { _id: string; name: string };
    class: { _id: string; name: string };
    isClassTeacher: boolean;
    subjects: { _id: string; name: string; code: string }[];
  }[];
}

export interface BoardSection {
  _id: string;
  name: string;
  class: { _id: string; name: string };
  students: number;
  marked: number;
  counts: AttendanceCounts;
  isMine: boolean;
  canMark: boolean;
}

export interface AttendanceBoard {
  /** YYYY-MM-DD */
  date: string;
  today: string;
  timezone: string;
  /** A holiday's name or "Sunday is a day off"; null on a school day. */
  dayOff: string | null;
  /** Earliest day this user may take a register for; null for the office. */
  earliestEditable: string | null;
  sections: BoardSection[];
  missed: { date: string; section: { _id: string; name: string }; class: { _id: string; name: string }; marked: number; students: number }[];
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
    student: { _id: string; firstName: string; lastName: string; admissionNumber: string; rollNumber?: string };
    status: AttendanceStatus | null;
    remark: string;
  }[];
}
