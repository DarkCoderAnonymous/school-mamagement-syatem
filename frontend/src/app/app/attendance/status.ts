import type { AttendanceStatus } from '@/lib/api/types';

/** Label, short code and colours for each register status — one source for the board and the register. */
export const ATTENDANCE_STATUS_META: Record<
  AttendanceStatus,
  { label: string; short: string; text: string; selected: string }
> = {
  PRESENT: { label: 'Present', short: 'P', text: 'text-success', selected: 'bg-success text-success-foreground border-success' },
  ABSENT: { label: 'Absent', short: 'A', text: 'text-destructive', selected: 'bg-destructive text-destructive-foreground border-destructive' },
  LATE: { label: 'Late', short: 'L', text: 'text-warning-ink', selected: 'bg-warning text-warning-foreground border-warning' },
  LEAVE: { label: 'Leave', short: 'Lv', text: 'text-info', selected: 'bg-info text-info-foreground border-info' },
};

export const ATTENDANCE_STATUSES = Object.keys(ATTENDANCE_STATUS_META) as AttendanceStatus[];
