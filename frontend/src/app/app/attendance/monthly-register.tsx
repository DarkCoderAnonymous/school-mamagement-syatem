'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { NativeSelect } from '@/components/form/native-select';
import { useUrlState } from '@/hooks/use-url-state';
import { cn } from '@/lib/utils';
import { getMonthlyRegister, getMyClasses, listClasses } from '@/lib/api/school';
import type { MonthlyRegister as MonthlyRegisterData } from '@/lib/api/types';
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_META } from './status';
import { StudentLink } from '@/components/students/student-quick-view';

const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The paper register for a month: students down the side, days across,
 * days off shaded, totals and attendance % on the right. A day's header
 * opens that day's register.
 */
export function MonthlyRegister() {
  const url = useUrlState();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const month = url.get('month') ?? thisMonth;

  const classes = useQuery({ queryKey: ['classes', 'options'], queryFn: () => listClasses({ limit: 100 }) });
  const mine = useQuery({ queryKey: ['my-classes'], queryFn: getMyClasses });
  // A teacher opens on their own section; everyone else on the first one.
  const sectionId =
    url.get('sectionId') ?? mine.data?.sections[0]?.section._id ?? classes.data?.items.flatMap((c) => c.sections)[0]?._id;

  const register = useQuery({
    queryKey: ['attendance-monthly', sectionId, month],
    queryFn: () => getMonthlyRegister(sectionId!, month),
    enabled: Boolean(sectionId),
  });
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-[0.8125rem] font-medium">Section</span>
          <NativeSelect className="w-56" value={sectionId ?? ''} onChange={(e) => url.set({ sectionId: e.target.value || undefined })}>
            {(classes.data?.items ?? []).map((c) => (
              <optgroup key={c._id} label={c.name}>
                {c.sections.map((s) => (
                  <option key={s._id} value={s._id}>
                    {c.name} · {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1">
          <span className="text-[0.8125rem] font-medium">Month</span>
          <Input
            type="month"
            className="h-9 w-44"
            value={month}
            max={thisMonth}
            onChange={(e) => e.target.value && url.set({ month: e.target.value === thisMonth ? undefined : e.target.value })}
          />
        </label>
        {register.data && (
          <Button variant="outline" className="ml-auto" onClick={() => downloadCsv(register.data!)}>
            <Download className="size-4" />
            Export CSV
          </Button>
        )}
      </div>

      {!sectionId && !classes.isLoading ? (
        <div className="rounded-xl border">
          <EmptyState title="No sections this session" description="Add classes and sections for the current session first." />
        </div>
      ) : register.isLoading || !register.data ? (
        register.isError ? (
          <div className="rounded-xl border">
            <ErrorState error={register.error} onRetry={() => void register.refetch()} title="Couldn't load the monthly register" />
          </div>
        ) : (
          <Skeleton className="h-96 w-full rounded-xl" />
        )
      ) : (
        <Grid data={register.data} monthName={monthName} />
      )}
    </div>
  );
}

function Grid({ data, monthName }: { data: MonthlyRegisterData; monthName: string }) {
  const totals = ATTENDANCE_STATUSES.map((s) => data.rows.reduce((sum, r) => sum + r.counts[s], 0));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-semibold">
          {data.class.name} · Section {data.section.name} <span className="text-muted-foreground font-normal">— {monthName}</span>
        </p>
        <p className="text-muted-foreground text-sm">
          {data.registersTaken} of {data.schoolDays} school day{data.schoolDays === 1 ? '' : 's'} taken
          {data.classTeacher && ` · Class teacher: ${data.classTeacher}`}
        </p>
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState title="No students in this section" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-max min-w-full border-collapse text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th scope="col" className="bg-muted/95 sticky left-0 z-10 min-w-44 px-3 py-2 text-left font-medium">
                  Student
                </th>
                {data.days.map((d) => (
                  <th
                    key={d.date}
                    scope="col"
                    className={cn('w-7 px-0 py-1 text-center font-medium', d.dayOff && 'bg-muted')}
                    title={d.dayOff ?? undefined}
                  >
                    {d.isFuture || d.dayOff ? (
                      <DayHeader day={d.date} weekday={d.weekday} />
                    ) : (
                      <Link href={`/app/attendance/${data.section._id}?date=${d.date}`} className="hover:text-foreground block" aria-label={`Open the register for ${d.date}`}>
                        <DayHeader day={d.date} weekday={d.weekday} />
                      </Link>
                    )}
                  </th>
                ))}
                {ATTENDANCE_STATUSES.map((s) => (
                  <th key={s} scope="col" className="border-l px-2 py-2 text-center font-medium" title={ATTENDANCE_STATUS_META[s].label}>
                    {ATTENDANCE_STATUS_META[s].short}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-medium" title="Present + late, over days marked">
                  %
                </th>
              </tr>
            </thead>
            <tbody className="rows-stagger divide-y">
              {data.rows.map((r) => (
                <tr key={r.student._id} className={cn('group/row hover:bg-muted/40 transition-colors', !r.current && 'text-muted-foreground')}>
                  <th scope="row" className="bg-background group-hover/row:bg-[color-mix(in_oklch,var(--color-muted)_40%,var(--color-background))] sticky left-0 z-10 px-3 py-1.5 text-left font-normal transition-colors">
                    <span className="text-muted-foreground mr-2 tabular-nums">{r.student.rollNumber ?? '—'}</span>
                    <StudentLink studentId={r.student._id} tab="attendance" filters={{ month: data.month }} className="font-medium">
                      {r.student.firstName} {r.student.lastName}
                    </StudentLink>
                    {!r.current && <span className="ml-1 text-[0.6875rem]">(left)</span>}
                  </th>
                  {data.days.map((d) => {
                    const status = r.marks[d.date];
                    return (
                      <td key={d.date} className={cn('h-7 text-center font-semibold', d.dayOff && 'bg-muted', status && ATTENDANCE_STATUS_META[status].text)}>
                        {status ? ATTENDANCE_STATUS_META[status].short : d.dayOff || d.isFuture ? '' : <span className="text-muted-foreground/40">·</span>}
                      </td>
                    );
                  })}
                  {ATTENDANCE_STATUSES.map((s) => (
                    <td key={s} className="border-l px-2 text-center tabular-nums">
                      {r.counts[s] || ''}
                    </td>
                  ))}
                  <td className={cn('px-3 text-right font-semibold tabular-nums', r.percentage !== null && r.percentage < 75 && 'text-destructive')}>
                    {r.percentage === null ? '—' : `${r.percentage}%`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30 border-t">
              <tr>
                <th scope="row" className="bg-muted/95 sticky left-0 z-10 px-3 py-1.5 text-left font-medium">
                  Present
                </th>
                {data.days.map((d) => {
                  const marked = Object.values(d.counts).reduce((a, b) => a + b, 0);
                  return (
                    <td key={d.date} className={cn('text-muted-foreground text-center tabular-nums', d.dayOff && 'bg-muted')}>
                      {marked ? d.counts.PRESENT + d.counts.LATE : ''}
                    </td>
                  );
                })}
                {totals.map((t, i) => (
                  <td key={ATTENDANCE_STATUSES[i]} className="border-l px-2 text-center font-medium tabular-nums">
                    {t || ''}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
        {ATTENDANCE_STATUSES.map((s) => (
          <li key={s}>
            <span className={cn('font-semibold', ATTENDANCE_STATUS_META[s].text)}>{ATTENDANCE_STATUS_META[s].short}</span> {ATTENDANCE_STATUS_META[s].label}
          </li>
        ))}
        <li>
          <span className="bg-muted inline-block size-3 rounded-sm align-middle" /> Holiday or day off
        </li>
        <li>· Not taken</li>
        <li>% = present + late over days marked; under 75% in red</li>
      </ul>
    </div>
  );
}

function DayHeader({ day, weekday }: { day: string; weekday: number }) {
  return (
    <>
      <span className="block text-[0.625rem] leading-none opacity-70">{WEEKDAY_INITIAL[weekday]}</span>
      <span className="block tabular-nums">{Number(day.slice(8))}</span>
    </>
  );
}

function downloadCsv(data: MonthlyRegisterData) {
  // Text starting with = + - @ tab or CR would run as a formula in Excel/Sheets
  // (CSV injection); a leading ' keeps it literal. Numbers are left alone.
  const quote = (v: string | number) => {
    const text = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const header = ['Roll', 'Student', 'Admission no.', ...data.days.map((d) => d.date.slice(8)), ...ATTENDANCE_STATUSES.map((s) => ATTENDANCE_STATUS_META[s].label), 'Attendance %'];
  const lines = data.rows.map((r) => [
    r.student.rollNumber ?? '',
    `${r.student.firstName} ${r.student.lastName}`,
    r.student.admissionNumber,
    ...data.days.map((d) => (r.marks[d.date] ? ATTENDANCE_STATUS_META[r.marks[d.date]!].short : d.dayOff ? 'Off' : '')),
    ...ATTENDANCE_STATUSES.map((s) => r.counts[s]),
    r.percentage ?? '',
  ]);
  const csv = [header, ...lines].map((row) => row.map(quote).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-${data.class.name}-${data.section.name}-${data.month}.csv`.replace(/\s+/g, '-');
  a.click();
  URL.revokeObjectURL(url);
}
