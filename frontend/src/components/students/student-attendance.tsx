'use client';

import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarCheck, ChevronLeft, ChevronRight, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ATTENDANCE_STATUS_META, ATTENDANCE_STATUSES } from '@/app/app/attendance/status';
import { cn } from '@/lib/utils';
import { getStudentAttendance } from '@/lib/api/school';
import type { AttendanceStatus, StudentAttendance as MonthData } from '@/lib/api/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOT: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-success',
  ABSENT: 'bg-destructive',
  LATE: 'bg-warning',
  LEAVE: 'bg-info',
};

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const monthTitle = (month: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
const dayTitle = (day: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));

/**
 * A student's attendance a month at a time: their % and counts, the month as
 * a calendar, and the days they weren't simply present. Month and status
 * filter live in the page URL; clicking a count lists just those days.
 */
export function StudentAttendance({
  studentId,
  month,
  filter,
  onChange,
}: {
  studentId: string;
  /** YYYY-MM, or undefined for the school's current month. */
  month: string | undefined;
  filter: AttendanceStatus | undefined;
  onChange: (next: { month?: string | null; status?: AttendanceStatus | null }) => void;
}) {
  const q = useQuery({
    queryKey: ['student-attendance', studentId, month ?? 'current'],
    queryFn: () => getStudentAttendance(studentId, month),
    placeholderData: keepPreviousData,
  });
  const data = q.data;

  if (!data) {
    return q.isError ? (
      <Card>
        <ErrorState
          error={q.error}
          onRetry={() => void q.refetch()}
          title="Couldn't load attendance"
        />
      </Card>
    ) : (
      <Skeleton className="h-96 w-full rounded-xl" />
    );
  }

  const atCurrentMonth = data.month >= data.today.slice(0, 7);
  const { monthTotals: mt, sessionTotals: st } = data;
  const listed = data.days.filter((d) =>
    filter ? d.status === filter : d.status && d.status !== 'PRESENT',
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous month"
          onClick={() => onChange({ month: shiftMonth(data.month, -1) })}
        >
          <ChevronLeft />
        </Button>
        <h2 className="flex items-center gap-2 font-semibold" aria-live="polite">
          {monthTitle(data.month)}
          {q.isFetching && (
            <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />
          )}
        </h2>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next month"
          disabled={atCurrentMonth}
          onClick={() => {
            const next = shiftMonth(data.month, 1);
            onChange({ month: next >= data.today.slice(0, 7) ? null : next });
          }}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="grid gap-6 @4xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-muted-foreground text-[0.8125rem] font-medium">
                    Attendance this month
                  </p>
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">
                    {mt.percentage === null ? '—' : `${mt.percentage}%`}
                  </p>
                </div>
                <p className="text-muted-foreground text-sm tabular-nums">
                  {mt.marked} of {data.schoolDays} school day{data.schoolDays === 1 ? '' : 's'}{' '}
                  marked
                </p>
              </div>
              <div
                role="progressbar"
                aria-label="Attendance this month"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={mt.percentage ?? 0}
                className={cn(
                  'h-2 overflow-hidden rounded-full',
                  mt.percentage !== null && mt.percentage < 75
                    ? 'bg-destructive-soft'
                    : 'bg-primary/15',
                )}
              >
                <div
                  className={cn(
                    'h-full rounded-full',
                    mt.percentage !== null && mt.percentage < 75 ? 'bg-destructive' : 'bg-primary',
                  )}
                  style={{ width: `${mt.percentage ?? 0}%` }}
                />
              </div>
              <div
                className="grid grid-cols-2 gap-2 @md:grid-cols-4"
                role="radiogroup"
                aria-label="Show days by status"
              >
                {ATTENDANCE_STATUSES.map((s) => {
                  const on = filter === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onChange({ status: on ? null : s })}
                      className={cn(
                        'focus-visible:ring-ring/50 flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-3',
                        on ? 'border-primary bg-primary/10' : 'hover:bg-muted',
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-xl font-semibold tabular-nums">
                        <span className={cn('size-2 rounded-full', DOT[s])} aria-hidden="true" />
                        {mt.counts[s]}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          on ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {ATTENDANCE_STATUS_META[s].label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-muted-foreground flex items-center gap-2 border-t pt-4 text-sm">
                <History className="size-4 shrink-0" aria-hidden="true" />
                {st.marked === 0
                  ? 'No registers taken yet this session.'
                  : `This session: ${st.percentage}% over ${st.marked} day${st.marked === 1 ? '' : 's'} · ${st.counts.ABSENT} absent, ${st.counts.LATE} late, ${st.counts.LEAVE} on leave`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-semibold">
                {filter ? `${ATTENDANCE_STATUS_META[filter].label} days` : 'Absent, late & leave'}
              </h2>
              {listed.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  className="py-8"
                  title={
                    filter
                      ? `No ${ATTENDANCE_STATUS_META[filter].label.toLowerCase()} days`
                      : mt.marked
                        ? 'Present every day marked'
                        : 'No registers this month'
                  }
                  description={
                    mt.marked ? undefined : 'Marks appear here once class registers are taken.'
                  }
                />
              ) : (
                <ul className="rows-stagger divide-y overflow-hidden rounded-lg border">
                  {listed.map((d) => (
                    <li key={d.date} className="flex items-center gap-4 px-4 py-3 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{dayTitle(d.date)}</span>
                        {d.remark && (
                          <span className="text-muted-foreground block text-xs">{d.remark}</span>
                        )}
                      </span>
                      <StatusBadge
                        status={d.status!}
                        label={ATTENDANCE_STATUS_META[d.status!].label}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <MonthGrid data={data} highlight={filter} />
      </div>
    </div>
  );
}

/** The month Monday-first: each day's mark as a coloured dot; days off shaded, the future faded. */
function MonthGrid({ data, highlight }: { data: MonthData; highlight?: AttendanceStatus }) {
  const cells = useMemo(() => {
    const lead = data.days.length ? (data.days[0]!.weekday + 6) % 7 : 0;
    const out: (MonthData['days'][number] | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...data.days,
    ];
    while (out.length % 7) out.push(null);
    return out;
  }, [data]);

  return (
    <Card className="h-fit">
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className="text-muted-foreground pb-1 text-xs font-medium">
              {w}
            </span>
          ))}
          {cells.map((d, i) =>
            d ? (
              <div key={d.date} className="aspect-square p-0.5">
                <div
                  title={`${dayTitle(d.date)}: ${d.status ? ATTENDANCE_STATUS_META[d.status].label : (d.dayOff ?? (d.isFuture ? 'not yet' : 'no mark'))}`}
                  className={cn(
                    'flex size-full flex-col items-center justify-center gap-0.5 rounded-md text-sm tabular-nums',
                    d.dayOff && 'bg-muted text-muted-foreground',
                    d.date === data.today && 'ring-primary ring-1',
                    (d.isFuture || (highlight && d.status !== highlight)) && 'opacity-30',
                  )}
                >
                  {Number(d.date.slice(8))}
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      d.status ? DOT[d.status] : 'bg-transparent',
                    )}
                    aria-hidden="true"
                  />
                </div>
              </div>
            ) : (
              <span key={`pad-${i}`} />
            ),
          )}
        </div>
        <div className="text-muted-foreground flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
          {ATTENDANCE_STATUSES.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn('size-2 rounded-full', DOT[s])} aria-hidden="true" />
              {ATTENDANCE_STATUS_META[s].label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="bg-muted size-2.5 rounded" aria-hidden="true" />
            Day off
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
