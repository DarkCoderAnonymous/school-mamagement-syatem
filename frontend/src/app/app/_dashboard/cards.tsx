'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, BarChart3, CalendarOff, ClipboardList, Table2 } from 'lucide-react';
import { useSchoolFormat } from '@/lib/format';
import { UNIT_LABEL } from '@/lib/labels';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DashboardSummary, FeeSummary, InventorySummary } from '@/lib/api/types';
import { ColumnChart, Meter, Sparkline, type MeterTone } from './charts';

const surface = 'bg-card rounded-xl border';

/** Card chrome shared by the dashboard panels: title, optional "today" tag, and a link out. */
function Panel({
  title,
  tag,
  href,
  linkLabel,
  className,
  children,
}: {
  title: string;
  tag?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(surface, 'flex flex-col gap-4 p-5', className)}>
      <header className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {tag && (
            <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[0.6875rem] font-medium">
              {tag}
            </span>
          )}
        </h2>
        {href && (
          <Link
            href={href}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-xs font-medium transition-colors"
          >
            {linkLabel}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * Icon tints for the headline tiles, drawn from the chart ramp so a row of
 * four reads as four different things at a glance. Decoration only: the
 * status colours (success/warning/destructive) are never used here, so a
 * tile can't be mistaken for a state.
 */
const KPI_HUE = {
  blue: 'bg-chart-1/12 text-chart-1',
  teal: 'bg-chart-2/14 text-chart-2',
  violet: 'bg-chart-5/12 text-chart-5',
  slate: 'bg-muted text-muted-foreground',
} as const;

/** A headline count. The whole tile is the link; the arrow surfaces on hover. */
export function KpiTile({
  href,
  label,
  value,
  hint,
  icon: Icon,
  hue = 'blue',
}: {
  href?: string;
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  hue?: keyof typeof KPI_HUE;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground truncate text-[0.8125rem] font-medium">{label}</p>
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', KPI_HUE[hue])}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-xl leading-8 font-semibold tracking-tight tabular-nums sm:text-[1.75rem] sm:leading-9">
          {value}
          {href && (
            <ArrowUpRight
              className="text-muted-foreground size-4 -translate-x-1 opacity-0 transition-[opacity,translate] group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
              aria-hidden="true"
            />
          )}
        </p>
        {hint && <p className="text-muted-foreground truncate text-xs">{hint}</p>}
      </div>
    </>
  );
  const className = cn(surface, 'group flex min-w-0 flex-col gap-2 p-4 sm:p-5');
  return href ? (
    <Link
      href={href}
      className={cn(
        className,
        'hover:border-primary/30 focus-visible:ring-ring transition-[box-shadow,border-color,translate] outline-none hover:-translate-y-px hover:shadow-md focus-visible:ring-2',
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function DayOff({ reason }: { reason: string }) {
  return (
    <div className="text-muted-foreground flex flex-1 items-center gap-3 text-sm">
      <span className="bg-muted grid size-9 place-items-center rounded-lg">
        <CalendarOff className="size-[18px]" aria-hidden="true" />
      </span>
      <span>
        <span className="text-foreground block font-medium">No school today</span>
        {reason}
      </span>
    </div>
  );
}

/** Attendance health bands. Each ships with a word, so state is never colour alone. */
function attendanceTone(rate: number): { tone: MeterTone; word: string } {
  if (rate >= 90) return { tone: 'accent', word: 'Healthy' };
  if (rate >= 75) return { tone: 'warning', word: 'Watch' };
  return { tone: 'danger', word: 'Low' };
}

const shortDay = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

export function StudentAttendanceCard({
  data,
}: {
  data: NonNullable<DashboardSummary['attendance']>;
}) {
  const fmt = useSchoolFormat();
  const health = data.rate === null ? null : attendanceTone(data.rate);
  return (
    <Panel
      title="Student attendance"
      tag="Today"
      href="/app/attendance"
      linkLabel="Registers"
      className="lg:col-span-2"
    >
      {data.dayOff ? (
        <DayOff reason={data.dayOff} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-3">
            {health && data.rate !== null ? (
              <div className="flex items-baseline gap-2">
                <p className="text-4xl leading-none font-semibold tracking-tight">{data.rate}%</p>
                <p className="text-muted-foreground text-sm">
                  present{data.registersTaken < data.sections ? ' so far' : ''} ·{' '}
                  <span className="text-foreground font-medium">{health.word}</span>
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No registers taken yet today.</p>
            )}
            <Meter
              value={
                data.rate === null
                  ? data.registersTaken / Math.max(1, data.sections)
                  : data.rate / 100
              }
              tone={health?.tone ?? 'accent'}
              label={data.rate === null ? 'Registers taken today' : 'Students present today'}
            />
            <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Stat term="Present" value={data.counts.PRESENT} dot="bg-success" />
              <Stat term="Absent" value={data.counts.ABSENT} dot="bg-destructive" />
              <Stat term="Late" value={data.counts.LATE} dot="bg-warning" />
              <Stat term="Leave" value={data.counts.LEAVE} dot="bg-info" />
            </dl>
            <p className="text-muted-foreground text-xs">
              {data.registersTaken} of {data.sections} registers taken · {fmt.number(data.marked)}{' '}
              of {fmt.number(data.students)} students marked
            </p>
          </div>
          {data.trend.length > 1 && (
            <div className="w-full space-y-1.5 sm:w-56">
              <Sparkline
                points={data.trend.map((t) => ({
                  key: t.date,
                  value: t.rate,
                  label: shortDay(t.date),
                }))}
                describe={(p) =>
                  p.value === null ? `${p.label}: not taken` : `${p.label}: ${p.value}% present`
                }
              />
              <p className="text-muted-foreground text-right text-[0.6875rem]">
                Last {data.trend.length} school days
              </p>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function Stat({ term, value, dot }: { term: string; value: number; dot: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
      <dt>{term}</dt>
      <dd className="text-foreground font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function StaffAttendanceCard({
  data,
}: {
  data: NonNullable<DashboardSummary['staffAttendance']>;
}) {
  const inToday = data.counts.PRESENT + data.counts.LATE + data.counts.HALF_DAY;
  const out = data.counts.ABSENT + data.counts.UNPAID_LEAVE;
  const notMarked = Math.max(0, data.onRegister - data.marked);
  return (
    <Panel title="Staff" tag="Today" href="/app/staff-attendance" linkLabel="Register">
      {data.dayOff ? (
        <DayOff reason={data.dayOff} />
      ) : data.marked === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-3">
          <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-xl">
            <ClipboardList className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium">Not taken yet</p>
            <p className="text-muted-foreground text-sm">{data.onRegister} staff on today&apos;s register.</p>
          </div>
          <Link
            href="/app/staff-attendance"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-fit')}
          >
            Take the register
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <p className="text-4xl leading-none font-semibold tracking-tight">{inToday}</p>
            <p className="text-muted-foreground text-sm">of {data.onRegister} in</p>
          </div>
          <Meter value={inToday / Math.max(1, data.onRegister)} label="Staff in today" />
          <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <Stat term="Out" value={out} dot="bg-destructive" />
            <Stat term="Leave" value={data.counts.LEAVE} dot="bg-info" />
          </dl>
          <p className="text-muted-foreground text-xs">
            {notMarked ? `${notMarked} not marked yet` : 'Register complete'}
          </p>
        </div>
      )}
    </Panel>
  );
}

const monthShort = (m: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(
    new Date(`${m}-01T00:00:00Z`),
  );
const monthLong = (m: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${m}-01T00:00:00Z`),
  );

/** The dashboard's one hero figure: this month's collections, with the six-month trend and the session's progress. */
export function FeeCollectionCard({ fees }: { fees: FeeSummary }) {
  const fmt = useSchoolFormat();
  const [asTable, setAsTable] = useState(false);
  const months = fees.monthlyCollections ?? [];
  const share = fees.billedMinor > 0 ? fees.collectedMinor / fees.billedMinor : 0;

  return (
    <Panel
      title="Fee collection"
      href="/app/fees/reports"
      linkLabel="Report"
      className="lg:col-span-2"
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,15rem)_1fr]">
        <div className="space-y-4">
          <div>
            <p className="text-muted-foreground text-[0.8125rem] font-medium">
              Collected this month
            </p>
            <p className="text-5xl leading-tight font-semibold tracking-tight">
              {fmt.money(fees.collectedThisMonthMinor)}
            </p>
            <p className="text-muted-foreground text-xs">
              {fmt.money(fees.collectedTodayMinor)} today
            </p>
          </div>
          {fees.billedMinor > 0 && (
            <div className="space-y-2">
              <Meter
                value={share}
                label={`Share of ${fees.sessionName ?? 'session'} fees collected`}
              />
              <p className="text-muted-foreground text-xs">
                <span className="text-foreground font-medium">
                  {Math.round(share * 100)}% collected
                </span>{' '}
                of {fmt.money(fees.billedMinor)} billed
                {fees.sessionName && (
                  <span className="whitespace-nowrap"> this session ({fees.sessionName})</span>
                )}
              </p>
            </div>
          )}
        </div>

        {months.length > 0 && (
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">Last 6 months</p>
              <button
                type="button"
                onClick={() => setAsTable((v) => !v)}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded text-xs transition-colors outline-none focus-visible:ring-2"
                aria-pressed={asTable}
              >
                {asTable ? (
                  <BarChart3 className="size-3.5" aria-hidden="true" />
                ) : (
                  <Table2 className="size-3.5" aria-hidden="true" />
                )}
                {asTable ? 'Chart' : 'Table'}
              </button>
            </div>
            {asTable ? (
              <table className="w-full text-sm">
                <caption className="sr-only">Fees collected per month</caption>
                <tbody className="rows-stagger divide-y">
                  {months.map((m) => (
                    <tr key={m.month} className="hover:bg-muted/40 transition-colors">
                      <th
                        scope="row"
                        className="text-muted-foreground py-1.5 text-left font-normal"
                      >
                        {monthLong(m.month)}
                      </th>
                      <td className="py-1.5 text-right">{fmt.money(m.amountMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <ColumnChart
                label="Fees collected per month, last six months"
                data={months.map((m) => ({
                  key: m.month,
                  label: monthShort(m.month),
                  fullLabel: monthLong(m.month),
                  value: m.amountMinor,
                }))}
                formatTick={fmt.moneyCompact}
                formatValue={fmt.money}
              />
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Outstanding and overdue as one story: how much is owed, and how much of it is late. */
export function DuesCard({ fees }: { fees: FeeSummary }) {
  const fmt = useSchoolFormat();
  const overdueShare = fees.outstandingMinor > 0 ? fees.overdueMinor / fees.outstandingMinor : 0;
  return (
    <Panel title="Dues" href="/app/fees/defaulters" linkLabel="Defaulters">
      <div className="space-y-4">
        <div>
          <p className="text-muted-foreground text-[0.8125rem] font-medium">Outstanding</p>
          <p className="text-[1.75rem] leading-9 font-semibold tracking-tight">
            {fmt.money(fees.outstandingMinor)}
          </p>
        </div>
        {fees.outstandingMinor > 0 ? (
          <div className="space-y-2">
            <Meter
              value={overdueShare}
              tone={fees.overdueMinor > 0 ? 'danger' : 'accent'}
              label="Share of outstanding fees that is overdue"
            />
            <p className="text-sm">
              <span className={cn('font-semibold', fees.overdueMinor > 0 && 'text-destructive')}>
                {fmt.money(fees.overdueMinor)}
              </span>{' '}
              <span className="text-muted-foreground">
                overdue · {Math.round(overdueShare * 100)}%
              </span>
            </p>
            {fees.overdueMinor > 0 && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <AlertTriangle className="text-destructive size-3.5" aria-hidden="true" />
                {fees.defaulterCount} student{fees.defaulterCount === 1 ? '' : 's'} ·{' '}
                {fees.overdueInvoiceCount} invoice{fees.overdueInvoiceCount === 1 ? '' : 's'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Every invoice is settled.</p>
        )}
      </div>
    </Panel>
  );
}

export function LowStockCard({ inventory }: { inventory: InventorySummary }) {
  return (
    <Panel title="Running low" href="/app/inventory?stock=low" linkLabel="All">
      <ul className="-mx-2 space-y-0.5">
        {inventory.lowStockItems.map((item) => (
          <li key={item._id}>
            <Link
              href={`/app/inventory/items/${item._id}`}
              className="hover:bg-muted flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors"
            >
              <span className="min-w-0 truncate">{item.name}</span>
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums',
                  item.quantityOnHand === 0
                    ? 'bg-destructive-soft text-destructive'
                    : 'bg-warning-soft text-warning-ink',
                )}
              >
                {item.quantityOnHand === 0
                  ? 'Out'
                  : `${item.quantityOnHand} ${UNIT_LABEL[item.unit].many}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
