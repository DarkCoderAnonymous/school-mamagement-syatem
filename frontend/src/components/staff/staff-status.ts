import type { StaffAttendanceStatus } from '@/lib/api/types';

/** How each staff-register mark reads on a staff profile: label, badge palette key and calendar dot. */
export const STAFF_STATUS_META: Record<StaffAttendanceStatus, { label: string; badge: string; dot: string }> = {
  PRESENT: { label: 'Present', badge: 'PRESENT', dot: 'bg-success' },
  LATE: { label: 'Late', badge: 'LATE', dot: 'bg-warning' },
  HALF_DAY: { label: 'Half day', badge: 'HALF_DAY', dot: 'bg-warning' },
  LEAVE: { label: 'Leave (paid)', badge: 'EXCUSED', dot: 'bg-info' },
  UNPAID_LEAVE: { label: 'Unpaid leave', badge: 'ABSENT', dot: 'bg-destructive' },
  ABSENT: { label: 'Absent', badge: 'ABSENT', dot: 'bg-destructive' },
};

export const STAFF_STATUSES = Object.keys(STAFF_STATUS_META) as StaffAttendanceStatus[];
