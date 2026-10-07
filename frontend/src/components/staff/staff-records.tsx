'use client';

import { BookOpen, ClipboardCheck, Wallet, type LucideIcon } from 'lucide-react';
import { Permission } from '@sms/shared';
import { usePermission } from '@/lib/permissions';
import type { PayrollStatus, StaffAttendanceStatus } from '@/lib/api/types';
import { EmployeeAttendance } from './employee-attendance';
import { StaffSalary } from './staff-salary';
import { TeacherClasses } from './teacher-classes';
import { STAFF_STATUSES } from './staff-status';

export type StaffRecordTab = 'classes' | 'attendance' | 'salary';

/**
 * A staff member's records beyond their profile, what each needs, and what it
 * takes to see it — the same permissions guard the endpoints. Classes need a
 * teacher record; attendance and salary need an employee record.
 */
const STAFF_TABS: { value: StaffRecordTab; label: string; icon: LucideIcon; permission: string; needs: 'teacher' | 'employee' }[] = [
  { value: 'classes', label: 'Classes', icon: BookOpen, permission: Permission.TEACHER_READ, needs: 'teacher' },
  { value: 'attendance', label: 'Attendance', icon: ClipboardCheck, permission: Permission.STAFF_ATTENDANCE_READ, needs: 'employee' },
  { value: 'salary', label: 'Salary', icon: Wallet, permission: Permission.PAYROLL_READ, needs: 'employee' },
];

/** The record tabs this viewer may open for this person. */
export function useStaffTabs(has: { teacher: boolean; employee: boolean }) {
  const can = usePermission();
  return STAFF_TABS.filter((t) => has[t.needs] && can(t.permission));
}

/** Each tab's filters, kept in the page URL. */
export interface StaffRecordFilters {
  month?: string;
  mark?: string;
  year?: string;
  slip?: string;
  session?: string;
  class?: string;
  subject?: string;
}

/** Filters belong to one tab; switching tabs drops the others'. */
export const STAFF_FILTER_KEYS: (keyof StaffRecordFilters)[] = ['month', 'mark', 'year', 'slip', 'session', 'class', 'subject'];

const PAYROLL_STATUSES: PayrollStatus[] = ['DRAFT', 'LOCKED', 'PUBLISHED'];
const oneOf = <T extends string>(options: readonly T[], value: string | undefined) =>
  options.includes(value as T) ? (value as T) : undefined;

/** One record tab's content; lays itself out by its own width. */
export function StaffRecordPanel({
  tab,
  teacherId,
  employeeId,
  profileSubjectIds = [],
  filters,
  onFiltersChange,
}: {
  tab: StaffRecordTab;
  teacherId?: string | null;
  employeeId?: string | null;
  profileSubjectIds?: string[];
  filters: StaffRecordFilters;
  /** A partial update; `null` clears a filter. */
  onFiltersChange: (next: { [K in keyof StaffRecordFilters]?: string | number | null }) => void;
}) {
  const year = Number(filters.year);
  return (
    <div className="@container">
      {tab === 'classes' && teacherId && (
        <TeacherClasses
          teacherId={teacherId}
          profileSubjectIds={profileSubjectIds}
          filters={{ session: filters.session, class: filters.class, subject: filters.subject }}
          onChange={onFiltersChange}
        />
      )}
      {tab === 'attendance' && employeeId && (
        <EmployeeAttendance
          employeeId={employeeId}
          month={filters.month}
          filter={oneOf<StaffAttendanceStatus>(STAFF_STATUSES, filters.mark)}
          onChange={(next) =>
            onFiltersChange({
              ...('month' in next ? { month: next.month } : {}),
              ...('status' in next ? { mark: next.status } : {}),
            })
          }
        />
      )}
      {tab === 'salary' && employeeId && (
        <StaffSalary
          employeeId={employeeId}
          year={Number.isInteger(year) && year > 0 ? year : undefined}
          status={oneOf(PAYROLL_STATUSES, filters.slip)}
          onChange={(next) =>
            onFiltersChange({
              ...('year' in next ? { year: next.year } : {}),
              ...('status' in next ? { slip: next.status } : {}),
            })
          }
        />
      )}
    </div>
  );
}
