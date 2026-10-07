'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { MoneyInput } from '@/components/form/money-input';
import { useUrlState } from '@/hooks/use-url-state';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName } from '@/lib/labels';
import { cancelAdvance, createAdvance, listAdvances, listPayrollStaff } from '@/lib/api/finance';
import type { SalaryAdvance } from '@/lib/api/types';

const STATUS = { ACTIVE: { status: 'PENDING', label: 'Recovering' }, CLOSED: { status: 'PAID', label: 'Recovered' }, CANCELLED: { status: 'CANCELLED', label: 'Cancelled' } } as const;

export function AdvancesTab() {
  const url = useUrlState();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState<SalaryAdvance>();
  const params = { page: url.getNumber('page', 1), limit: 25 };
  const query = useQuery({ queryKey: ['salary-advances', params], queryFn: () => listAdvances(params) });
  const cancel = useMutation({
    mutationFn: (a: SalaryAdvance) => cancelAdvance(a._id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['salary-advances'] });
      toast.success('Recovery stopped');
      setCancelling(undefined);
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't cancel it")),
  });

  const columns = useMemo<DataTableColumn<SalaryAdvance>[]>(
    () => [
      { id: 'employee', header: 'Staff member', cell: ({ row }) => <span className="font-medium">{fullName(row.original.employeeId)}</span> },
      { id: 'issued', header: 'Issued', cell: ({ row }) => fmt.date(row.original.issuedAt) },
      { id: 'amount', header: 'Advance', cell: ({ row }) => <span className="tabular-nums">{fmt.money(row.original.amountMinor)}</span> },
      { id: 'instalment', header: 'Per month', cell: ({ row }) => <span className="tabular-nums">{fmt.money(row.original.installmentMinor)}</span> },
      {
        id: 'progress',
        header: 'Recovered',
        cell: ({ row }) => {
          const pct = Math.min(1, row.original.recoveredMinor / row.original.amountMinor);
          return (
            <div className="flex items-center gap-2">
              <span className="bg-muted h-1.5 w-20 overflow-hidden rounded-full" aria-hidden="true">
                <span className="bg-success block h-full origin-left" style={{ transform: `scaleX(${pct})` }} />
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">{fmt.money(row.original.recoveredMinor)}</span>
            </div>
          );
        },
      },
      { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge {...STATUS[row.original.status]} /> },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) =>
          row.original.status === 'ACTIVE' && can(Permission.PAYROLL_MANAGE) ? (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setCancelling(row.original)}>Stop recovery</Button>
            </div>
          ) : null,
      },
    ],
    [can, fmt],
  );

  const add = (
    <PermissionGate permission={Permission.PAYROLL_MANAGE}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Record advance
      </Button>
    </PermissionGate>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">Money advanced to staff, recovered from each locked payroll run until repaid.</p>
        {add}
      </div>
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        getRowId={(r) => r._id}
        emptyTitle="No advances"
        emptyDescription="When a staff member takes a salary advance or loan, record it here with its monthly instalment."
        emptyAction={add}
      />
      <AdvanceDialog open={open} onOpenChange={setOpen} />
      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(o) => !o && setCancelling(undefined)}
        title="Stop recovering this advance?"
        description={cancelling ? `${fmt.money(cancelling.outstandingMinor)} still outstanding will no longer be deducted. Amounts already recovered stay recovered.` : undefined}
        confirmLabel="Stop recovery"
        destructive
        pending={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling)}
      />
    </div>
  );
}

function AdvanceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const staff = useQuery({ queryKey: ['payroll-staff', 'all'], queryFn: () => listPayrollStaff({ limit: 100 }), enabled: open });
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState(0);
  const [installment, setInstallment] = useState(0);
  const [reason, setReason] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEmployeeId('');
      setAmount(0);
      setInstallment(0);
      setReason('');
    }
  }
  const months = installment > 0 ? Math.ceil(amount / installment) : 0;
  const mutation = useMutation({
    mutationFn: () => createAdvance({ employeeId, amountMinor: amount, installmentMinor: installment, reason: reason || undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['salary-advances'] });
      toast.success('Advance recorded');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't record the advance")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record an advance</DialogTitle>
          <DialogDescription>The instalment comes off each month’s pay when payroll is locked.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Staff member" required>
            {({ id }) => (
              <NativeSelect id={id} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Select…</option>
                {staff.data?.items.map((s) => (
                  <option key={s._id} value={s._id}>
                    {fullName(s)} ({s.employeeNumber})
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount advanced" required>{({ id }) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
            <Field label="Monthly instalment" required>{({ id }) => <MoneyInput id={id} value={installment} onChange={setInstallment} />}</Field>
          </div>
          {months > 0 && installment <= amount && (
            <p className="text-muted-foreground text-sm">Repaid over {months} month{months === 1 ? '' : 's'} ({fmt.money(installment)} a month).</p>
          )}
          {installment > amount && <p className="text-destructive text-xs">The instalment can’t be more than the advance.</p>}
          <Field label="Reason">{({ id }) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!employeeId || amount <= 0 || installment <= 0 || installment > amount || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Record advance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
