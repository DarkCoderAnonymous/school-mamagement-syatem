'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { useUrlState } from '@/hooks/use-url-state';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { monthLabel, RUN_STATUS } from '@/lib/labels';
import { createPayrollRun, listPayrollRuns } from '@/lib/api/finance';
import type { PayrollRun } from '@/lib/api/types';

export default function PayrollRunsPage() {
  const url = useUrlState();
  const router = useRouter();
  const fmt = useSchoolFormat();
  const [open, setOpen] = useState(false);
  const params = { page: url.getNumber('page', 1), limit: url.getNumber('limit', 25) };
  const query = useQuery({ queryKey: ['payroll-runs', params], queryFn: () => listPayrollRuns(params) });

  const columns = useMemo<DataTableColumn<PayrollRun>[]>(
    () => [
      { id: 'month', header: 'Month', cell: ({ row }) => <span className="font-medium">{monthLabel(row.original.month)}</span> },
      { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge {...RUN_STATUS[row.original.status]} /> },
      { id: 'staff', header: 'Staff', cell: ({ row }) => <span className="tabular-nums">{row.original.employeeCount}</span> },
      { id: 'gross', header: 'Gross', cell: ({ row }) => <span className="tabular-nums">{fmt.money(row.original.grossMinor)}</span> },
      { id: 'deductions', header: 'Deductions', cell: ({ row }) => <span className="tabular-nums">{fmt.money(row.original.deductionsMinor)}</span> },
      { id: 'net', header: 'Net pay', cell: ({ row }) => <span className="font-medium tabular-nums">{fmt.money(row.original.netMinor)}</span> },
    ],
    [fmt],
  );

  const create = (
    <PermissionGate permission={Permission.PAYROLL_RUN}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Run payroll
      </Button>
    </PermissionGate>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="One run per month: review the draft, lock it, then publish to pay staff and post the salary expense."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Payroll' }]}
        action={create}
      />
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        getRowId={(r) => r._id}
        onRowClick={(r) => router.push(`/app/payroll/runs/${r._id}`)}
        emptyTitle="No payroll runs yet"
        emptyDescription="Set salaries under Salaries & advances, then run this month’s payroll."
        emptyAction={create}
      />
      <NewRunDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function NewRunDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => createPayrollRun(month),
    onSuccess: async (run) => {
      await queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
      toast.success(`Draft payroll for ${monthLabel(run.month)}`, {
        description: run.missingStructures?.length
          ? `${run.missingStructures.length} staff have no salary set and were left out.`
          : `${run.employeeCount} payslips ready to review.`,
      });
      onOpenChange(false);
      router.push(`/app/payroll/runs/${run._id}`);
    },
    onError: (e) => setError(errorMessage(e, "Couldn't start the run")),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setError(null); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Run payroll</DialogTitle>
          <DialogDescription>Creates draft payslips for everyone with a salary. Nothing is paid until you publish.</DialogDescription>
        </DialogHeader>
        <Field label="Month">{({ id }) => <Input id={id} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}</Field>
        {error && <p role="alert" className="text-destructive animate-shake text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!month || mutation.isPending}>
            {mutation.isPending ? 'Calculating…' : 'Create draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
