import type { AttendanceStatus } from './api/types';

/** One source for how each register status looks — the same letters and colours as the web register. */
export const STATUS_META: Record<AttendanceStatus, { label: string; short: string; selected: string; selectedText: string; dot: string }> = {
  PRESENT: { label: 'Present', short: 'P', selected: 'bg-success border-success', selectedText: 'text-success-foreground', dot: 'bg-success' },
  ABSENT: { label: 'Absent', short: 'A', selected: 'bg-destructive border-destructive', selectedText: 'text-destructive-foreground', dot: 'bg-destructive' },
  LATE: { label: 'Late', short: 'L', selected: 'bg-warning border-warning', selectedText: 'text-warning-foreground', dot: 'bg-warning' },
  LEAVE: { label: 'Leave', short: 'Lv', selected: 'bg-info border-info', selectedText: 'text-info-foreground', dot: 'bg-info' },
};
export const STATUSES = Object.keys(STATUS_META) as AttendanceStatus[];
