'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useSchoolFormat } from '@/lib/format';
import { fullName, PAYMENT_METHOD_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { getCollections } from '@/lib/api/finance';
import type { FeePayment } from '@/lib/api/types';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const PRESETS = [
  { label: 'Today', range: () => [iso(new Date()), iso(new Date())] },
  { label: 'Last 7 days', range: () => [iso(new Date(Date.now() - 6 * 86_400_000)), iso(new Date())] },
  { label: 'This month', range: () => [`${iso(new Date()).slice(0, 7)}-01`, iso(new Date())] },
] as const;

export default function CollectionReportPage() {
  const fmt = useSchoolFormat();
  const [[from, to], setRange] = useState<[string, string]>(() => PRESETS[2].range() as [string, string]);
  const query = useQuery({ queryKey: ['fee-collections', from, to], queryFn: () => getCollections(from, to), enabled: Boolean(from && to) });
  const r = query.data;
  const maxDay = Math.max(1, ...(r?.byDay.map((d) => d.amountMinor) ?? [1]));

  const columns = useMemo<DataTableColumn<FeePayment>[]>(
    () => [
      { id: 'receipt', header: 'Receipt', cell: ({ row }) => <span className="font-mono text-xs">{row.original.receiptNumber}</span> },
      { id: 'date', header: 'Date', cell: ({ row }) => fmt.date(row.original.paidAt, true) },
      { id: 'student', header: 'Student', cell: ({ row }) => fullName(row.original.studentId) },
      { id: 'method', header: 'Method', cell: ({ row }) => PAYMENT_METHOD_LABEL[row.original.method] },
      { id: 'by', header: 'Received by', cell: ({ row }) => fullName(row.original.receivedByUserId) },
      { id: 'amount', header: 'Net', cell: ({ row }) => <span className="block text-right tabular-nums">{fmt.money(row.original.netMinor)}</span> },
    ],
    [fmt],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collection report"
        description="Fees actually received, net of refunds. Reversed payments are left out."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Collection report' }]}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1">
          {PRESETS.map((p) => {
            const [f, t] = p.range();
            const on = f === from && t === to;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={on}
                onClick={() => setRange([f, t] as [string, string])}
                className={cn('rounded-md border px-3 py-1.5 text-sm transition-colors', on ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <label className="text-sm">
          <span className="text-muted-foreground mb-1 block text-xs">From</span>
          <Input type="date" value={from} max={to} onChange={(e) => setRange([e.target.value, to])} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground mb-1 block text-xs">To</span>
          <Input type="date" value={to} min={from} onChange={(e) => setRange([from, e.target.value])} />
        </label>
      </div>

      {query.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
      {query.isError && (
        <div className="rounded-xl border">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load the report" />
        </div>
      )}

      {r && (
        <>
          <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
            <section className="bg-card space-y-4 rounded-xl border p-5">
              <div>
                <p className="text-muted-foreground text-xs">Collected</p>
                <p className="text-3xl font-semibold tabular-nums">{fmt.money(r.totalMinor)}</p>
                <p className="text-muted-foreground text-sm">{r.paymentCount} payments</p>
              </div>
              <ul className="space-y-2 border-t pt-4 text-sm">
                {r.byMethod.length === 0 && <li className="text-muted-foreground">No payments in this period.</li>}
                {r.byMethod.map((m) => (
                  <li key={m.method} className="flex justify-between gap-3">
                    <span>{PAYMENT_METHOD_LABEL[m.method]} <span className="text-muted-foreground">× {m.count}</span></span>
                    <span className="tabular-nums">{fmt.money(m.amountMinor)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="bg-card space-y-3 rounded-xl border p-5">
              <h2 className="text-sm font-semibold">By day</h2>
              {r.byDay.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing collected in this period.</p>
              ) : (
                <ul className="space-y-1.5">
                  {r.byDay.map((d) => (
                    <li key={d.date} className="grid grid-cols-[6.5rem_1fr_7rem] items-center gap-3 text-sm">
                      <span className="text-muted-foreground tabular-nums">{fmt.date(`${d.date}T00:00:00Z`)}</span>
                      <span className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden="true">
                        <span className="bg-primary block h-full origin-left rounded-full" style={{ transform: `scaleX(${d.amountMinor / maxDay})` }} />
                      </span>
                      <span className="text-right tabular-nums">{fmt.money(d.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <DataTable
            columns={columns}
            data={r.payments}
            getRowId={(p) => p._id}
            exportFileName={`collections-${from}-to-${to}`}
            emptyTitle="No payments"
            emptyDescription="Nothing was collected in this period."
          />
        </>
      )}
    </div>
  );
}
