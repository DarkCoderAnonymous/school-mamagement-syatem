'use client';

import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Landmark, Loader2, ReceiptText, Wallet } from 'lucide-react';
import { Permission } from '@sms/shared';
import { PermissionGate } from '@/components/auth/permission-gate';
import { ToggleChip } from '@/components/form/toggle-chip';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney, useSchoolFormat } from '@/lib/format';
import { monthLabel, RUN_STATUS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { getStaffPay } from '@/lib/api/finance';
import type { PayrollStatus, PayslipLine } from '@/lib/api/types';

const STATUS_FILTERS: PayrollStatus[] = ['DRAFT', 'LOCKED', 'PUBLISHED'];

/**
 * A staff member's pay: what their salary structure comes to in a full month,
 * open advances, and a year of payslips — each one the snapshot it was issued
 * as. Year and payslip status live in the page URL.
 */
export function StaffSalary({
  employeeId,
  year,
  status,
  onChange,
}: {
  employeeId: string;
  /** Undefined = the latest year they have payslips in. */
  year: number | undefined;
  status: PayrollStatus | undefined;
  onChange: (next: { year?: number | null; status?: PayrollStatus | null }) => void;
}) {
  const fmt = useSchoolFormat();
  const q = useQuery({
    queryKey: ['staff-pay', employeeId, year ?? 'latest'],
    queryFn: () => getStaffPay(employeeId, year),
    placeholderData: keepPreviousData,
  });
  const data = q.data;

  if (!data) {
    return q.isError ? (
      <Card>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn't load salary" />
      </Card>
    ) : (
      <Skeleton className="h-96 w-full rounded-xl" />
    );
  }

  const money = (minor: number) => formatMoney(minor, data.currency);
  const m = data.monthly;
  const outstanding = data.advances.reduce((sum, a) => sum + a.outstandingMinor, 0);
  const slips = status ? data.payslips.filter((p) => p.status === status) : data.payslips;
  const yt = data.yearTotals;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-4">
        <StatCard label="Monthly gross" value={m ? money(m.grossMinor) : '—'} hint={m ? 'Basic plus allowances' : 'No salary set'} />
        <StatCard label="Monthly take-home" value={m ? money(m.netMinor) : '—'} hint={m ? `After ${money(m.totalDeductionsMinor)} deductions` : undefined} />
        <StatCard
          label={`Paid in ${data.year}`}
          value={money(yt.netMinor)}
          hint={`${yt.payslips} payslip${yt.payslips === 1 ? '' : 's'} issued${yt.unpaidLeaveDays ? ` · ${yt.unpaidLeaveDays} unpaid day${yt.unpaidLeaveDays === 1 ? '' : 's'}` : ''}`}
        />
        <StatCard
          label="Advances outstanding"
          tone={outstanding > 0 ? 'warning' : 'default'}
          value={money(outstanding)}
          hint={data.advances.length ? `${data.advances.length} open advance${data.advances.length === 1 ? '' : 's'}` : 'None open'}
        />
      </div>

      <div className="grid gap-6 @4xl:grid-cols-[1fr_22rem]">
        <Card className="order-2 @4xl:order-1">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold">
                Payslips
                {q.isFetching && <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter payslips by status">
                  {STATUS_FILTERS.map((s) => (
                    <ToggleChip key={s} on={status === s} onClick={() => onChange({ status: status === s ? null : s })}>
                      {RUN_STATUS[s].label}
                    </ToggleChip>
                  ))}
                </div>
                <Select value={String(data.year)} onValueChange={(v) => onChange({ year: Number(v) })}>
                  <SelectTrigger size="sm" className="min-w-[6.5rem]" aria-label="Year">
                    <SelectValue>{(v: string) => <span>{v}</span>}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {data.years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {slips.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                className="py-10"
                title={status ? `No ${RUN_STATUS[status].label.toLowerCase()} payslips in ${data.year}` : `No payslips in ${data.year}`}
                description={status ? 'Try another status or year.' : 'Payslips appear here once a payroll run includes them.'}
              />
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Unpaid days</TableHead>
                      <TableHead className="text-right">Net pay</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slips.map((p) => (
                      <TableRow key={p._id}>
                        <TableCell>
                          <Link href={`/app/payroll/payslips/${p._id}`} className="hover:text-primary font-medium">
                            {monthLabel(p.month)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.grossMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.totalDeductionsMinor)}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.unpaidLeaveDays || '—'}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{money(p.netMinor)}</TableCell>
                        <TableCell>
                          <StatusBadge status={RUN_STATUS[p.status].status} label={RUN_STATUS[p.status].label} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="order-1 space-y-6 @4xl:order-2">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-2">
                <Wallet className="text-muted-foreground size-4" aria-hidden="true" />
                <h2 className="font-semibold">Salary structure</h2>
              </div>
              {!m || !data.structure ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground text-sm">No salary is set for them yet, so payroll runs leave them out.</p>
                  <PermissionGate permission={Permission.PAYROLL_MANAGE}>
                    <Link href="/app/payroll/setup" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'w-fit')}>
                      Set salary in payroll setup
                    </Link>
                  </PermissionGate>
                </div>
              ) : (
                <>
                  <dl className="space-y-1.5 text-sm">
                    <Line label="Basic" amount={money(m.basicMinor)} />
                    <Lines lines={m.earnings} money={money} />
                    <Line label="Gross" amount={money(m.grossMinor)} strong />
                    <Lines lines={m.deductions} money={money} negative />
                    <Line label="Take-home" amount={money(m.netMinor)} strong />
                  </dl>
                  <p className="text-muted-foreground text-xs">
                    A full month with no unpaid days or advance instalments. Effective from {fmt.date(data.structure.effectiveFrom)}.
                  </p>
                  {(data.structure.bankName || data.structure.accountNumber) && (
                    <p className="text-muted-foreground flex items-start gap-2 border-t pt-3 text-xs">
                      <Landmark className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {[data.structure.bankName, data.structure.accountTitle].filter(Boolean).join(' · ')}
                        {data.structure.accountNumber && <span className="block font-mono">{data.structure.accountNumber}</span>}
                      </span>
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {data.advances.length > 0 && (
            <Card>
              <CardContent className="space-y-3 p-6">
                <h2 className="font-semibold">Open advances</h2>
                <ul className="divide-y overflow-hidden rounded-lg border">
                  {data.advances.map((a) => (
                    <li key={a._id} className="space-y-0.5 px-4 py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium tabular-nums">{money(a.outstandingMinor)} left</span>
                        <span className="text-muted-foreground text-xs">{fmt.date(a.issuedAt)}</span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {money(a.amountMinor)} advanced · {money(a.installmentMinor)} a month
                        {a.reason ? ` · ${a.reason}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Line({ label, amount, strong, negative }: { label: string; amount: string; strong?: boolean; negative?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'border-t pt-1.5 font-semibold')}>
      <dt className={cn(!strong && 'text-muted-foreground')}>{label}</dt>
      <dd className="tabular-nums">
        {negative ? '−' : ''}
        {amount}
      </dd>
    </div>
  );
}

function Lines({ lines, money, negative }: { lines: PayslipLine[]; money: (minor: number) => string; negative?: boolean }) {
  return lines.map((l) => <Line key={`${l.code ?? ''}${l.name}`} label={l.name} amount={money(l.amountMinor)} negative={negative} />);
}
