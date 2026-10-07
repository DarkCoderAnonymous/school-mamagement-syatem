'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { useUrlState } from '@/hooks/use-url-state';
import { useSchoolFormat } from '@/lib/format';
import { monthLabel } from '@/lib/labels';
import { listMyPayslips } from '@/lib/api/finance';
import type { Payslip } from '@/lib/api/types';

export default function MyPayslipsPage() {
  const url = useUrlState();
  const router = useRouter();
  const fmt = useSchoolFormat();
  const params = { page: url.getNumber('page', 1), limit: 24 };
  const query = useQuery({ queryKey: ['my-payslips', params], queryFn: () => listMyPayslips(params) });
  const columns = useMemo<DataTableColumn<Payslip>[]>(
    () => [
      { id: 'month', header: 'Month', cell: ({ row }) => <span className="font-medium">{monthLabel(row.original.month)}</span> },
      { id: 'gross', header: 'Gross', cell: ({ row }) => <span className="tabular-nums">{fmt.money(row.original.grossMinor)}</span> },
      { id: 'deductions', header: 'Deductions', cell: ({ row }) => <span className="tabular-nums">{fmt.money(row.original.totalDeductionsMinor)}</span> },
      { id: 'net', header: 'Net pay', cell: ({ row }) => <span className="font-semibold tabular-nums">{fmt.money(row.original.netMinor)}</span> },
    ],
    [fmt],
  );
  return (
    <div className="space-y-6">
      <PageHeader title="My payslips" description="Your published payslips. Open one to view or print it." breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'My payslips' }]} />
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        getRowId={(r) => r._id}
        onRowClick={(r) => router.push(`/app/my-payslips/${r._id}`)}
        emptyTitle="No payslips yet"
        emptyDescription="Your payslip appears here once the school publishes that month’s payroll."
      />
    </div>
  );
}
