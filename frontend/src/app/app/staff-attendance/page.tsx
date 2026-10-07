'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarOff, CheckCheck, Info, Lock } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/use-url-state';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { cn } from '@/lib/utils';
import { getStaffMonthSummary, getStaffRegister, saveStaffRegister } from '@/lib/api/school';
import type { StaffAttendanceStatus, StaffRegister } from '@/lib/api/types';
import { DateNav } from '../attendance/date-nav';

const STATUS: Record<StaffAttendanceStatus, { label: string; short: string; selected: string; text: string }> = {
  PRESENT: { label: 'Present', short: 'P', selected: 'bg-success text-success-foreground border-success', text: 'text-success' },
  LATE: { label: 'Late', short: 'L', selected: 'bg-warning text-warning-foreground border-warning', text: 'text-warning-ink' },
  HALF_DAY: { label: 'Half day', short: '½', selected: 'bg-warning text-warning-foreground border-warning', text: 'text-warning-ink' },
  LEAVE: { label: 'Leave (paid)', short: 'Lv', selected: 'bg-info text-info-foreground border-info', text: 'text-info' },
  UNPAID_LEAVE: { label: 'Unpaid leave', short: 'UL', selected: 'bg-destructive text-destructive-foreground border-destructive', text: 'text-destructive' },
  ABSENT: { label: 'Absent', short: 'A', selected: 'bg-destructive text-destructive-foreground border-destructive', text: 'text-destructive' },
};
const STATUSES = Object.keys(STATUS) as StaffAttendanceStatus[];

/** The office's daily staff register, and each person's month — the unpaid days payroll drafts from. */
export default function StaffAttendancePage() {
  const url = useUrlState();
  const tab = url.get('tab') ?? 'register';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff attendance"
        description="Take the staff register each school day. Absences and unpaid leave feed the month’s payroll draft."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Staff attendance' }]}
      />
      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'register' ? undefined : String(v), date: undefined, month: undefined })}>
        <TabsList>
          <TabsTrigger value="register">Daily register</TabsTrigger>
          <TabsTrigger value="month">Monthly</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'register' ? <DailyRegister /> : <MonthSummary />}
    </div>
  );
}

type Draft = Record<string, { status: StaffAttendanceStatus | null; remark: string }>;

/** A day nobody has started opens with everyone present (staff on leave as paid leave) — mark the exceptions. */
function draftFrom(reg: StaffRegister): Draft {
  const fresh = reg.canEdit && reg.marked === 0;
  return Object.fromEntries(
    reg.rows.map((r) => [
      r.employee._id,
      { status: r.status ?? (fresh ? (r.employee.status === 'ON_LEAVE' ? 'LEAVE' : 'PRESENT') : null), remark: r.remark },
    ]),
  );
}

function DailyRegister() {
  const url = useUrlState();
  const date = url.get('date');
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const key = ['staff-register', date ?? 'today'];
  const register = useQuery({ queryKey: key, queryFn: () => getStaffRegister(date) });
  const reg = register.data;

  // Edits belong to the version of the register they were made on.
  const version = reg ? `${reg.date}|${reg.marked}|${reg.lastMarked?.at ?? ''}` : '';
  const [edits, setEdits] = useState<{ version: string; draft: Draft }>();
  const draft = useMemo<Draft>(() => (edits?.version === version ? edits.draft : reg ? draftFrom(reg) : {}), [edits, version, reg]);
  const set = (employeeId: string, patch: Partial<Draft[string]>) =>
    setEdits({ version, draft: { ...draft, [employeeId]: { ...(draft[employeeId] ?? { status: null, remark: '' }), ...patch } } });

  const changed = useMemo(
    () =>
      (reg?.rows ?? []).filter((r) => {
        const d = draft[r.employee._id];
        return d?.status && (d.status !== r.status || d.remark.trim() !== r.remark);
      }),
    [reg, draft],
  );
  const unmarked = reg ? reg.rows.filter((r) => !draft[r.employee._id]?.status).length : 0;

  const save = useMutation({
    mutationFn: () =>
      saveStaffRegister({
        date: reg!.date,
        entries: changed.map((r) => {
          const d = draft[r.employee._id]!;
          return { employeeId: r.employee._id, status: d.status!, remark: d.remark.trim() || undefined };
        }),
      }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(key, saved);
      await queryClient.invalidateQueries({ queryKey: ['staff-month'] });
      toast.success('Staff register saved', { description: `${saved.counts.PRESENT + saved.counts.LATE} in, ${saved.counts.ABSENT} absent.` });
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save the staff register")),
  });

  if (register.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (register.isError || !reg) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={register.error} onRetry={() => void register.refetch()} title="Couldn't load the staff register" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DateNav date={reg.date} today={reg.today} onChange={(day) => url.set({ date: day })} />

      {!reg.canEdit && reg.readOnlyReason && (
        <Alert>
          {reg.dayOff ? <CalendarOff aria-hidden="true" /> : <Lock aria-hidden="true" />}
          <AlertDescription>{reg.readOnlyReason}</AlertDescription>
        </Alert>
      )}
      {reg.canEdit && reg.marked === 0 && reg.rows.length > 0 && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>Everyone starts as present (staff on leave as paid leave) — mark the exceptions, then save.</AlertDescription>
        </Alert>
      )}

      {reg.rows.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState title="No staff on the register" description="Staff appear here once they’re on payroll or added as teachers." />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
              {STATUSES.map((s) => (
                <li key={s}>
                  <span className={cn('font-semibold', STATUS[s].text)}>{STATUS[s].short}</span> {STATUS[s].label}
                </li>
              ))}
            </ul>
            {reg.canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEdits({
                    version,
                    draft: Object.fromEntries(reg.rows.map((r) => [r.employee._id, { remark: draft[r.employee._id]?.remark ?? '', status: 'PRESENT' as const }])),
                  })
                }
              >
                <CheckCheck className="size-4" />
                Mark all present
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Staff member</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Attendance</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Remark</th>
                </tr>
              </thead>
              <tbody className="rows-stagger divide-y">
                {reg.rows.map((r) => {
                  const d = draft[r.employee._id] ?? { status: r.status, remark: r.remark };
                  const name = `${r.employee.firstName} ${r.employee.lastName}`;
                  return (
                    <tr key={r.employee._id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{name}</p>
                        <p className="text-muted-foreground text-xs">
                          {r.employee.designation}
                          {r.employee.department && ` · ${r.employee.department}`} · <span className="font-mono">{r.employee.employeeNumber}</span>
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <div role="radiogroup" aria-label={`Attendance for ${name}`} className="inline-flex flex-wrap gap-1">
                          {STATUSES.map((status) => {
                            const on = d.status === status;
                            return (
                              <button
                                key={status}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                aria-label={STATUS[status].label}
                                title={STATUS[status].label}
                                disabled={!reg.canEdit}
                                onClick={() => set(r.employee._id, { status })}
                                className={cn(
                                  'focus-visible:ring-ring h-8 min-w-9 rounded-md border px-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed',
                                  on ? STATUS[status].selected : 'text-muted-foreground hover:bg-muted',
                                  !on && !reg.canEdit && 'opacity-40',
                                )}
                              >
                                {STATUS[status].short}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="hidden px-4 py-2 md:table-cell">
                        {reg.canEdit ? (
                          <Input
                            aria-label={`Remark for ${name}`}
                            value={d.remark}
                            maxLength={200}
                            placeholder={d.status && d.status !== 'PRESENT' ? 'Reason (optional)' : ''}
                            onChange={(e) => set(r.employee._id, { remark: e.target.value })}
                            className="h-8"
                          />
                        ) : (
                          <span className="text-muted-foreground">{r.remark || '—'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {reg.canEdit && (
            <div className="bg-background/90 sticky bottom-0 z-10 -mx-4 border-t px-4 py-4 backdrop-blur sm:mx-0 sm:px-0">
              <div className="flex items-center justify-between gap-4">
                <p className="text-muted-foreground text-sm" aria-live="polite">
                  {unmarked > 0
                    ? `${unmarked} not marked yet`
                    : reg.lastMarked
                      ? `Last saved ${fmt.date(reg.lastMarked.at, true)}${reg.lastMarked.by ? ` by ${reg.lastMarked.by}` : ''}`
                      : 'Everyone marked'}
                </p>
                <Button onClick={() => save.mutate()} disabled={changed.length === 0 || save.isPending}>
                  {save.isPending ? 'Saving…' : changed.length ? `Save register (${changed.length})` : 'Saved'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MonthSummary() {
  const url = useUrlState();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const month = url.get('month') ?? thisMonth;
  const summary = useQuery({ queryKey: ['staff-month', month], queryFn: () => getStaffMonthSummary(month) });
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-semibold">{monthName}</p>
        <label className="flex items-center gap-2">
          <span className="sr-only">Month</span>
          <Input
            type="month"
            className="h-9 w-44"
            value={month}
            max={thisMonth}
            onChange={(e) => e.target.value && url.set({ month: e.target.value === thisMonth ? undefined : e.target.value })}
          />
        </label>
      </div>

      {summary.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : summary.isError || !summary.data ? (
        <div className="rounded-xl border">
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        </div>
      ) : summary.data.rows.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState title="No staff this month" />
        </div>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {summary.data.schoolDays} school day{summary.data.schoolDays === 1 ? '' : 's'} so far. Unpaid days are what the payroll draft
            will deduct: absent and unpaid leave count 1, half day ½.
          </p>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Staff member</th>
                  {STATUSES.map((s) => (
                    <th key={s} scope="col" className="px-2 py-2.5 text-center font-medium" title={STATUS[s].label}>
                      {STATUS[s].label}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Unpaid days</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Registers</th>
                </tr>
              </thead>
              <tbody className="rows-stagger divide-y">
                {summary.data.rows.map((r) => (
                  <tr key={r.employee._id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">
                        {r.employee.firstName} {r.employee.lastName}
                      </p>
                      <p className="text-muted-foreground text-xs">{r.employee.designation}</p>
                    </td>
                    {STATUSES.map((s) => (
                      <td key={s} className={cn('px-2 py-2.5 text-center tabular-nums', r.counts[s] ? STATUS[s].text : 'text-muted-foreground/60')}>
                        {r.counts[s]}
                      </td>
                    ))}
                    <td className={cn('px-4 py-2.5 text-right font-semibold tabular-nums', r.unpaidDays > 0 && 'text-destructive')}>{r.unpaidDays}</td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right text-xs tabular-nums">
                      {r.marked}/{summary.data!.schoolDays}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
