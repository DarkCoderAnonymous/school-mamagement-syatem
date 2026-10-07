'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FilePlus2, Gavel, HandCoins, Layers, Scale, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useUrlState } from '@/hooks/use-url-state';
import { useClassOptions } from '@/hooks/use-school-options';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName, invoiceBadge } from '@/lib/labels';
import { applyLateFines, getFeeSummary, listInvoices } from '@/lib/api/finance';
import type { FeeInvoice } from '@/lib/api/types';
import { GenerateInvoicesDialog } from './generate-dialog';
import { NewInvoiceDialog } from './invoice-dialogs';
import { StudentLink } from '@/components/students/student-quick-view';

export default function InvoicesPage() {
  const url = useUrlState();
  const router = useRouter();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const classes = useClassOptions();
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmFines, setConfirmFines] = useState(false);

  const summary = useQuery({ queryKey: ['fee-summary'], queryFn: getFeeSummary, enabled: can(Permission.FEE_REPORT_READ) });
  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    sort: url.get('sort') ?? '-issueDate',
    search: url.get('search'),
    status: url.get('status'),
    classId: url.get('classId'),
  };
  const query = useQuery({ queryKey: ['fee-invoices', params], queryFn: () => listInvoices(params) });
  const filtered = Boolean(params.search || params.status || params.classId);

  const fines = useMutation({
    mutationFn: applyLateFines,
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['fee-invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['fee-summary'] });
      toast.success(r.invoicesFined ? `Late fines added to ${r.invoicesFined} invoices` : 'No new late fines were due', {
        description: r.invoicesFined ? `${fmt.money(r.addedMinor)} in total.` : undefined,
      });
      setConfirmFines(false);
    },
    onError: (e) => {
      toast.error(errorMessage(e, "Couldn't apply late fines"));
      setConfirmFines(false);
    },
  });

  const columns = useMemo<DataTableColumn<FeeInvoice>[]>(
    () => [
      {
        id: 'invoiceNumber',
        header: 'Invoice',
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-xs font-medium">{row.original.invoiceNumber}</p>
            <p className="text-muted-foreground text-xs">{row.original.periodLabel}</p>
          </div>
        ),
      },
      {
        id: 'student',
        header: 'Student',
        cell: ({ row }) => (
          <div className="min-w-0">
            <StudentLink studentId={row.original.studentId?._id} tab="fees" className="block truncate font-medium">
              {fullName(row.original.studentId)}
            </StudentLink>
            <p className="text-muted-foreground text-xs">
              {row.original.classId?.name}
              {row.original.sectionId ? ` · ${row.original.sectionId.name}` : ''}
            </p>
          </div>
        ),
      },
      { id: 'dueDate', header: 'Due', cell: ({ row }) => <span className="tabular-nums">{fmt.date(row.original.dueDate)}</span> },
      { id: 'totalMinor', header: 'Amount', cell: ({ row }) => <span className="tabular-nums">{fmt.money(row.original.totalMinor)}</span> },
      {
        id: 'balance',
        header: 'Balance',
        cell: ({ row }) => (
          <span className={row.original.balanceMinor > 0 ? 'font-medium tabular-nums' : 'text-muted-foreground tabular-nums'}>
            {fmt.money(row.original.balanceMinor)}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const b = invoiceBadge(row.original);
          return <StatusBadge status={b.status} label={b.label} />;
        },
      },
    ],
    [fmt],
  );

  const s = summary.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description={s?.sessionName ? `Fees billed in ${s.sessionName}.` : 'Fees billed to students.'}
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Invoices' }]}
        action={
          <>
            <PermissionGate permission={Permission.FEE_INVOICE_ADJUST}>
              <Button variant="ghost" onClick={() => setConfirmFines(true)}>
                <Gavel className="size-4" />
                Apply late fines
              </Button>
            </PermissionGate>
            <PermissionGate permission={Permission.FEE_INVOICE_CREATE}>
              <Button variant="outline" onClick={() => setCreating(true)}>
                <FilePlus2 className="size-4" />
                One-off
              </Button>
              <Button onClick={() => setGenerating(true)}>
                <Layers className="size-4" />
                Generate invoices
              </Button>
            </PermissionGate>
          </>
        }
      />

      {can(Permission.FEE_REPORT_READ) && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="Billed" value={s ? fmt.money(s.billedMinor) : '—'} hint={s ? `${s.invoiceCount} invoices` : undefined} icon={Wallet} loading={summary.isLoading} />
          <StatCard label="Collected" value={s ? fmt.money(s.collectedMinor) : '—'} hint={s ? `${fmt.money(s.collectedThisMonthMinor)} this month` : undefined} icon={HandCoins} tone="success" loading={summary.isLoading} />
          <StatCard label="Outstanding" value={s ? fmt.money(s.outstandingMinor) : '—'} icon={Scale} loading={summary.isLoading} />
          <StatCard
            label="Overdue"
            value={s ? fmt.money(s.overdueMinor) : '—'}
            hint={s ? `${s.defaulterCount} students` : undefined}
            icon={AlertTriangle}
            tone={s && s.overdueMinor > 0 ? 'danger' : 'default'}
            loading={summary.isLoading}
            footer={
              s && s.overdueMinor > 0 ? (
                <button type="button" className="text-primary mt-2 text-xs hover:underline" onClick={() => url.set({ status: 'OVERDUE', page: undefined })}>
                  Show overdue
                </button>
              ) : undefined
            }
          />
        </div>
      )}

      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        sortableColumns={['invoiceNumber', 'dueDate', 'totalMinor']}
        getRowId={(r) => r._id}
        onRowClick={(r) => router.push(`/app/fees/invoices/${r._id}`)}
        exportFileName="invoices"
        emptyTitle={filtered ? 'No invoices match these filters' : 'No invoices yet'}
        emptyDescription={
          filtered ? 'Try a different search or clear the filters.' : 'Set up class fees in Fee setup, then generate this month’s invoices.'
        }
        toolbar={
          <FilterBar
            searchPlaceholder="Search invoice no. or student…"
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: [
                  { value: 'OPEN', label: 'Unpaid or part paid' },
                  { value: 'OVERDUE', label: 'Overdue' },
                  { value: 'PAID', label: 'Paid' },
                  { value: 'CANCELLED', label: 'Cancelled' },
                ],
              },
              { key: 'classId', label: 'Class', options: (classes.data ?? []).map((c) => ({ value: c._id, label: c.name })) },
            ]}
          />
        }
      />

      <GenerateInvoicesDialog open={generating} onOpenChange={setGenerating} />
      <NewInvoiceDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={confirmFines}
        onOpenChange={setConfirmFines}
        title="Apply late fines now?"
        description="Every overdue invoice gets the fine your late-fine rule works out for today. Running it again never adds a fine twice."
        confirmLabel="Apply fines"
        pending={fines.isPending}
        onConfirm={() => fines.mutate()}
      />
    </div>
  );
}
