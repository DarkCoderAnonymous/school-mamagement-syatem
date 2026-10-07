'use client';

import { Award, ClipboardCheck, FileText, Wallet, type LucideIcon } from 'lucide-react';
import { Permission } from '@sms/shared';
import { StudentResults, type Outcome } from '@/components/exams/student-results';
import { usePermission } from '@/lib/permissions';
import type { AttendanceStatus } from '@/lib/api/types';
import { StudentAttendance } from './student-attendance';
import { StudentFees, type InvoiceFilter } from './student-fees';

export type RecordTab = 'fees' | 'attendance' | 'exams' | 'tests';

/** A student's records beyond their profile, and what it takes to see each — the same permissions guard the endpoints. */
export const RECORD_TABS: {
  value: RecordTab;
  label: string;
  icon: LucideIcon;
  permission: string;
}[] = [
  {
    value: 'attendance',
    label: 'Attendance',
    icon: ClipboardCheck,
    permission: Permission.ATTENDANCE_READ,
  },
  { value: 'fees', label: 'Fees', icon: Wallet, permission: Permission.FEE_INVOICE_READ },
  { value: 'exams', label: 'Exams', icon: Award, permission: Permission.EXAM_READ },
  { value: 'tests', label: 'Tests', icon: FileText, permission: Permission.EXAM_READ },
];

/** Which results tab an exam's students open on: class tests (unit tests, mocks) or term exams. */
export const resultsTabFor = (examType: string | undefined): RecordTab =>
  examType === 'UNIT_TEST' || examType === 'MOCK' ? 'tests' : 'exams';

/** The record tabs this viewer may open. */
export function useRecordTabs() {
  const can = usePermission();
  return RECORD_TABS.filter((t) => can(t.permission));
}

/** Each tab's filter — kept in the URL on the student page, in local state in the quick view. */
export interface RecordFilters {
  invoices?: InvoiceFilter;
  month?: string;
  mark?: AttendanceStatus;
  result?: Outcome;
}

/** Filters that belong to one tab; switching tabs drops the others'. */
export const RECORD_FILTER_KEYS: (keyof RecordFilters)[] = ['invoices', 'month', 'mark', 'result'];

/**
 * One record tab's content. Lays itself out by its own width (a container),
 * so it fits the full student page and the narrower quick-view panel alike.
 */
export function StudentRecordPanel({
  studentId,
  tab,
  filters,
  onFiltersChange,
}: {
  studentId: string;
  tab: RecordTab;
  filters: RecordFilters;
  /** A partial update; `null` clears a filter. */
  onFiltersChange: (next: { [K in keyof RecordFilters]?: RecordFilters[K] | null }) => void;
}) {
  return (
    <div className="@container">
      {tab === 'fees' && (
        <StudentFees
          studentId={studentId}
          filter={filters.invoices}
          onFilterChange={(f) => onFiltersChange({ invoices: f ?? null })}
        />
      )}
      {tab === 'attendance' && (
        <StudentAttendance
          studentId={studentId}
          month={filters.month}
          filter={filters.mark}
          onChange={(next) =>
            onFiltersChange({
              ...('month' in next ? { month: next.month } : {}),
              ...('status' in next ? { mark: next.status } : {}),
            })
          }
        />
      )}
      {(tab === 'exams' || tab === 'tests') && (
        <StudentResults
          key={tab}
          studentId={studentId}
          kind={tab === 'exams' ? 'exam' : 'test'}
          outcome={filters.result}
          onOutcomeChange={(o) => onFiltersChange({ result: o ?? null })}
        />
      )}
    </div>
  );
}
