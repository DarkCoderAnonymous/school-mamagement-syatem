'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarOff, ClipboardCheck, History } from 'lucide-react';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/use-url-state';
import { usePermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { getAttendanceBoard } from '@/lib/api/school';
import type { AttendanceBoard } from '@/lib/api/types';
import { ATTENDANCE_STATUS_META } from './status';
import { DateNav, longDate } from './date-nav';
import { MonthlyRegister } from './monthly-register';

/**
 * Student attendance: the day's registers (Daily) and a section's month as a
 * grid (Monthly register).
 */
export default function AttendancePage() {
  const url = useUrlState();
  const can = usePermission();
  const office = can(Permission.ATTENDANCE_MANAGE);
  const view = url.get('view') ?? 'daily';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description={
          view === 'monthly'
            ? 'A section’s month at a glance — every student, every day, with attendance %.'
            : office
              ? 'Every section’s register for the day. Pick an earlier date to correct one.'
              : 'Take today’s register for the sections you teach.'
        }
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Attendance' }]}
        action={
          <Link href="/app/holidays" className={buttonVariants({ variant: 'outline' })}>
            <CalendarOff className="size-4" />
            Holidays & days off
          </Link>
        }
      />
      <Tabs
        value={view}
        onValueChange={(v) => url.set({ view: v === 'daily' ? undefined : String(v), date: undefined, scope: undefined, month: undefined, sectionId: undefined })}
      >
        <TabsList>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="monthly">Monthly register</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === 'monthly' ? <MonthlyRegister /> : <DailyBoard office={office} />}
    </div>
  );
}

/**
 * The day's registers. Teachers land on their own sections (class teacher or
 * assigned); the office sees every section and can pick an earlier day to
 * correct. Each card opens that section's register.
 */
function DailyBoard({ office }: { office: boolean }) {
  const url = useUrlState();
  const scope = url.get('scope') ?? (office ? 'all' : 'mine');
  const date = url.get('date');

  const board = useQuery({
    queryKey: ['attendance-board', { date, scope }],
    queryFn: () => getAttendanceBoard({ date, mine: scope === 'mine' }),
  });
  const isToday = !board.data || board.data.date === board.data.today;

  return (
    <div className="space-y-4">
      <Tabs value={scope} onValueChange={(v) => url.set({ scope: v === (office ? 'all' : 'mine') ? undefined : String(v) })}>
        <TabsList>
          <TabsTrigger value="mine">My sections</TabsTrigger>
          <TabsTrigger value="all">All sections</TabsTrigger>
        </TabsList>
      </Tabs>

      {board.data && <DateNav date={board.data.date} today={board.data.today} onChange={(day) => url.set({ date: day })} />}

      {board.data?.dayOff && (
        <Alert>
          <CalendarOff aria-hidden="true" />
          <AlertTitle>No school — {board.data.dayOff}</AlertTitle>
          <AlertDescription>Registers aren’t taken on days off, and they don’t count towards the catch-up window.</AlertDescription>
        </Alert>
      )}

      {board.data && board.data.missed.length > 0 && <MissedRegisters missed={board.data.missed} earliest={board.data.earliestEditable} />}

      {board.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : board.isError || !board.data ? (
        <div className="rounded-xl border">
          <ErrorState error={board.error} onRetry={() => void board.refetch()} title="Couldn't load the registers" />
        </div>
      ) : board.data.sections.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState
            icon={ClipboardCheck}
            title={scope === 'mine' ? 'No sections assigned to you' : 'No sections this session'}
            description={
              scope === 'mine'
                ? 'You can take a section’s register once you’re its class teacher or teach a subject in it. Ask the school office to assign you.'
                : 'Add classes and sections for the current session first.'
            }
          />
        </div>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {isToday ? 'Today' : longDate(board.data.date)} · {board.data.sections.filter((s) => s.marked >= s.students && s.students > 0).length} of{' '}
            {board.data.sections.length} registers complete
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {board.data.sections.map((s) => (
              <SectionCard key={s._id} section={s} date={isToday ? undefined : board.data.date} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Registers a teacher can still take for earlier days — what's waiting after leave. */
function MissedRegisters({ missed, earliest }: { missed: AttendanceBoard['missed']; earliest: string | null }) {
  return (
    <Alert className="border-warning/40 bg-warning-soft/40">
      <History aria-hidden="true" />
      <AlertTitle>
        {missed.length} earlier register{missed.length === 1 ? '' : 's'} still to take
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{earliest ? `You can take registers back to ${longDate(earliest)}. After that, only the office can.` : 'Take them before they fall outside the catch-up window.'}</p>
        <ul className="flex flex-wrap gap-2">
          {missed.map((m) => (
            <li key={`${m.date}-${m.section._id}`}>
              <Link href={`/app/attendance/${m.section._id}?date=${m.date}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                {m.class.name}-{m.section.name} · {longDate(m.date).split(',')[0]} {m.date.slice(8)}
                <span className="text-muted-foreground tabular-nums">
                  {m.marked}/{m.students}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function SectionCard({ section, date }: { section: AttendanceBoard['sections'][number]; date?: string }) {
  const complete = section.students > 0 && section.marked >= section.students;
  const started = section.marked > 0;
  const href = `/app/attendance/${section._id}${date ? `?date=${date}` : ''}`;

  return (
    // The <li> is a flex item so every card in a grid row stretches to the tallest one.
    <li className="flex">
      <Link
        href={href}
        className="group bg-card hover:border-primary/40 focus-visible:ring-ring flex flex-1 flex-col gap-4 rounded-xl border p-5 transition-[box-shadow,border-color] outline-none hover:shadow-md focus-visible:ring-2"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              {section.class.name} <span className="text-muted-foreground font-normal">· Section {section.name}</span>
            </h2>
            <p className="text-muted-foreground text-xs">
              {section.students} {section.students === 1 ? 'student' : 'students'}
              {section.isMine && ' · yours'}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
              complete ? 'bg-success-soft text-success' : started ? 'bg-warning-soft text-warning-ink' : 'bg-muted text-muted-foreground',
            )}
          >
            {complete ? 'Taken' : started ? `${section.marked}/${section.students}` : 'Not taken'}
          </span>
        </div>

        {started ? (
          <dl className="grid grid-cols-4 gap-2 text-center">
            {(Object.keys(ATTENDANCE_STATUS_META) as (keyof typeof ATTENDANCE_STATUS_META)[]).map((status) => (
              <div key={status} className="rounded-md border py-1.5">
                <dt className="text-muted-foreground text-[0.6875rem]">{ATTENDANCE_STATUS_META[status].label}</dt>
                <dd className={cn('text-sm font-semibold tabular-nums', ATTENDANCE_STATUS_META[status].text)}>{section.counts[status]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p
            className={cn(
              'mt-auto flex items-center gap-1 text-sm',
              section.canMark ? 'text-primary font-medium' : 'text-muted-foreground',
            )}
          >
            {section.canMark ? 'Take the register' : 'Not taken yet.'}
            {section.canMark && (
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            )}
          </p>
        )}
      </Link>
    </li>
  );
}
