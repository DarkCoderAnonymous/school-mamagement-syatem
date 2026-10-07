'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { HandCoins } from 'lucide-react';
import Link from 'next/link';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { PermissionGate } from '@/components/auth/permission-gate';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { useUrlState } from '@/hooks/use-url-state';
import { useSchoolFormat } from '@/lib/format';
import { fullName, PAYMENT_METHOD_LABEL } from '@/lib/labels';
import { listPayments } from '@/lib/api/finance';
import type { FeePayment } from '@/lib/api/types';
import { StudentLink } from '@/components/students/student-quick-view';

export default function ReceiptsPage() {
  const url = useUrlState();
  const router = useRouter();
  const fmt = useSchoolFormat();
  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    sort: url.get('sort') ?? '-paidAt',
    search: url.get('search'),
    method: url.get('method'),
    status: url.get('status'),
  };
  const query = useQuery({ queryKey: ['fee-payments', params], queryFn: () => listPayments(params) });

  const columns = useMemo<DataTableColumn<FeePayment>[]>(
    () => [
      { id: 'receiptNumber', header: 'Receipt', cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.receiptNumber}</span> },
      {
        id: 'student',
        header: 'Student',
        cell: ({ row }) => (
          <div className="min-w-0">
            <StudentLink studentId={row.original.studentId?._id} tab="fees" className="block truncate font-medium">
              {fullName(row.original.studentId)}
            </StudentLink>
            <p className="text-muted-foreground font-mono text-xs">{row.original.studentId?.admissionNumber}</p>
          </div>
        ),
      },
      { id: 'paidAt', header: 'Date', cell: ({ row }) => <span className="tabular-nums">{fmt.date(row.original.paidAt, true)}</span> },
      { id: 'method', header: 'Method', cell: ({ row }) => PAYMENT_METHOD_LABEL[row.original.method] },
      { id: 'receivedBy', header: 'Received by', cell: ({ row }) => fullName(row.original.receivedByUserId) },
      {
        id: 'amountMinor',
        header: 'Amount',
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.status === 'REVERSED' ? (
              <StatusBadge status="CANCELLED" label="Reversed" />
            ) : (
              <>
                <p className="font-medium">{fmt.money(row.original.netMinor)}</p>
                {row.original.refundedMinor > 0 && <p className="text-muted-foreground text-xs">{fmt.money(row.original.refundedMinor)} refunded</p>}
              </>
            )}
          </div>
        ),
      },
    ],
    [fmt],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        description="Every fee payment received, newest first."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Receipts' }]}
        action={
          <PermissionGate permission={Permission.FEE_PAYMENT_RECORD}>
            <Link href="/app/fees/collect" className={buttonVariants()}>
              <HandCoins className="size-4" />
              Collect fees
            </Link>
          </PermissionGate>
        }
      />
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        sortableColumns={['receiptNumber', 'amountMinor']}
        getRowId={(r) => r._id}
        onRowClick={(r) => router.push(`/app/fees/payments/${r._id}`)}
        exportFileName="receipts"
        emptyTitle="No receipts yet"
        emptyDescription="Payments collected at the counter appear here with their receipt numbers."
        toolbar={
          <FilterBar
            searchPlaceholder="Search receipt number…"
            filters={[
              { key: 'method', label: 'Method', options: Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label })) },
              { key: 'status', label: 'Status', options: [{ value: 'COMPLETED', label: 'Completed' }, { value: 'REVERSED', label: 'Reversed' }] },
            ]}
          />
        }
      />
    </div>
  );
}
