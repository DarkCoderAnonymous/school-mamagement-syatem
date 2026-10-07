'use client';

import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { HandCoins, ReceiptText } from 'lucide-react';
import { Permission } from '@sms/shared';
import { PermissionGate } from '@/components/auth/permission-gate';
import { ToggleChip } from '@/components/form/toggle-chip';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSchoolFormat } from '@/lib/format';
import { invoiceBadge, PAYMENT_METHOD_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { getStudentDues, listInvoices } from '@/lib/api/finance';

export type InvoiceFilter = 'OPEN' | 'OVERDUE' | 'PAID' | 'CANCELLED';
const FILTERS: { value: InvoiceFilter; label: string }[] = [
  { value: 'OPEN', label: 'Still due' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

/**
 * A student's fees: what's due, every invoice (filtered by status) and recent
 * receipts. The filter lives in the page URL so the view can be shared.
 */
export function StudentFees({
  studentId,
  filter,
  onFilterChange,
}: {
  studentId: string;
  filter: InvoiceFilter | undefined;
  onFilterChange: (f: InvoiceFilter | undefined) => void;
}) {
  const fmt = useSchoolFormat();
  const dues = useQuery({
    queryKey: ['fee-dues', studentId],
    queryFn: () => getStudentDues(studentId),
  });
  const invoices = useInfiniteQuery({
    queryKey: ['fee-invoices', 'student', studentId, filter ?? null],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listInvoices({ studentId, status: filter, page: pageParam, limit: 20, sort: '-dueDate' }),
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });
  const items = invoices.data?.pages.flatMap((p) => p.items) ?? [];
  const d = dues.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 @xl:grid-cols-3">
        <StatCard
          label="Total due"
          loading={dues.isLoading}
          value={d ? fmt.money(d.totalDueMinor) : '—'}
          hint={
            d ? `${d.invoices.length} open invoice${d.invoices.length === 1 ? '' : 's'}` : undefined
          }
        />
        <StatCard
          label="Overdue"
          loading={dues.isLoading}
          tone={d && d.overdueMinor > 0 ? 'danger' : 'default'}
          value={d ? fmt.money(d.overdueMinor) : '—'}
          hint={d ? (d.overdueMinor > 0 ? 'Past due date' : 'Nothing overdue') : undefined}
        />
        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-3 p-5">
            <div className="space-y-1">
              <p className="text-muted-foreground text-[0.8125rem] font-medium">Concessions</p>
              <p className="text-sm">
                {d && d.concessions.length > 0
                  ? d.concessions
                      .map(
                        (c) =>
                          `${c.name} (${c.type === 'PERCENT' ? `${c.value}%` : fmt.money(c.value)})`,
                      )
                      .join(', ')
                  : 'None'}
              </p>
            </div>
            <PermissionGate permission={Permission.FEE_PAYMENT_RECORD}>
              {d && d.totalDueMinor > 0 && (
                <Link
                  href={`/app/fees/collect?studentId=${studentId}`}
                  className={cn(buttonVariants({ size: 'sm' }), 'w-fit')}
                >
                  <HandCoins className="size-4" />
                  Collect payment
                </Link>
              )}
            </PermissionGate>
          </CardContent>
        </Card>
      </div>
      {dues.isError && (
        <ErrorState
          error={dues.error}
          onRetry={() => void dues.refetch()}
          title="Couldn't load this student's dues"
        />
      )}

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Invoices</h2>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter invoices by status"
            >
              {FILTERS.map((f) => (
                <ToggleChip
                  key={f.value}
                  on={filter === f.value}
                  onClick={() => onFilterChange(filter === f.value ? undefined : f.value)}
                >
                  {f.label}
                </ToggleChip>
              ))}
            </div>
          </div>
          {invoices.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : invoices.isError ? (
            <ErrorState
              error={invoices.error}
              onRetry={() => void invoices.refetch()}
              title="Couldn't load invoices"
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              className="py-10"
              title={filter ? 'No invoices match' : 'No invoices yet'}
              description={
                filter ? 'Try another status.' : 'Nothing has been billed to this student.'
              }
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((inv) => {
                    const badge = invoiceBadge(inv);
                    const cancelled = inv.status === 'CANCELLED';
                    return (
                      <TableRow key={inv._id}>
                        <TableCell>
                          <Link
                            href={`/app/fees/invoices/${inv._id}`}
                            className="hover:text-primary font-mono text-xs"
                          >
                            {inv.invoiceNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{inv.periodLabel}</TableCell>
                        <TableCell className="tabular-nums">{fmt.date(inv.dueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.money(inv.totalMinor)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-medium tabular-nums',
                            !cancelled && inv.isOverdue && 'text-destructive',
                          )}
                        >
                          {fmt.money(cancelled ? 0 : inv.balanceMinor)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={badge.status} label={badge.label} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {invoices.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              disabled={invoices.isFetchingNextPage}
              onClick={() => void invoices.fetchNextPage()}
            >
              {invoices.isFetchingNextPage ? 'Loading…' : 'Show more'}
            </Button>
          )}
        </CardContent>
      </Card>

      {d && d.recentPayments.length > 0 && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Recent receipts</h2>
            <ul className="rows-stagger divide-y overflow-hidden rounded-lg border">
              {d.recentPayments.map((p) => (
                <li key={p._id}>
                  <Link
                    href={`/app/fees/payments/${p._id}`}
                    className="hover:bg-muted/50 flex items-center gap-4 px-4 py-3 text-sm transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs">{p.receiptNumber}</span>
                      <span className="text-muted-foreground block text-xs">
                        {fmt.date(p.paidAt)} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        p.status === 'REVERSED' && 'text-muted-foreground line-through',
                      )}
                    >
                      {fmt.money(p.netMinor)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
