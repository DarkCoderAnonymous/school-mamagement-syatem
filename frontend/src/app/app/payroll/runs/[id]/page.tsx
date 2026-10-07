'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Lock, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/auth/permission-gate';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { MoneyInput } from '@/components/form/money-input';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName, monthLabel, RUN_STATUS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import {
  discardPayrollRun,
  downloadBankExport,
  getPayrollRun,
  lockPayrollRun,
  publishPayrollRun,
  recalculatePayrollRun,
  updatePayslip,
} from '@/lib/api/finance';
import type { Payslip, PayrollStatus } from '@/lib/api/types';

const STEPS: { status: PayrollStatus; label: string; hint: string }[] = [
  { status: 'DRAFT', label: 'Review', hint: 'Adjust leave and bonuses' },
  { status: 'LOCKED', label: 'Lock', hint: 'Figures frozen, advances recovered' },
  { status: 'PUBLISHED', label: 'Publish', hint: 'Staff see payslips; expense posted' },
];

export default function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Payslip>();
  const [confirm, setConfirm] = useState<'lock' | 'publish' | 'discard' | null>(null);
  const query = useQuery({ queryKey: ['payroll-runs', id], queryFn: () => getPayrollRun(id) });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
    await queryClient.invalidateQueries({ queryKey: ['finance'] });
  };
  const action = useMutation({
    mutationFn: async (kind: 'recalculate' | 'lock' | 'publish' | 'discard') => {
      if (kind === 'recalculate') return recalculatePayrollRun(id);
      if (kind === 'lock') return lockPayrollRun(id);
      if (kind === 'publish') return publishPayrollRun(id);
      await discardPayrollRun(id);
      return null;
    },
    onSuccess: async (_d, kind) => {
      await refresh();
      setConfirm(null);
      if (kind === 'discard') {
        toast.success('Draft discarded');
        router.replace('/app/payroll');
        return;
      }
      toast.success({ recalculate: 'Recalculated from current salaries', lock: 'Payroll locked', publish: 'Payroll published — staff can see their payslips' }[kind]);
    },
    onError: (e) => {
      toast.error(errorMessage(e, 'That didn’t work'));
      setConfirm(null);
    },
  });

  const columns = useMemo<DataTableColumn<Payslip>[]>(
    () => [
      {
        id: 'employee',
        header: 'Employee',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.employee.name}</p>
            <p className="text-muted-foreground text-xs">{row.original.employee.designation}</p>
          </div>
        ),
      },
      { id: 'gross', header: 'Gross', cell: ({ row }) => <span className="tabular-nums">{fmt.money(row.original.grossMinor)}</span> },
      {
        id: 'deductions',
        header: 'Deductions',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmt.money(row.original.totalDeductionsMinor)}
            {row.original.unpaidLeaveDays > 0 && <span className="text-muted-foreground block text-xs">incl. {row.original.unpaidLeaveDays}d unpaid leave</span>}
          </span>
        ),
      },
      {
        id: 'adjustments',
        header: 'Adjustments',
        cell: ({ row }) => {
          const sum = row.original.adjustments.reduce((s, a) => s + a.amountMinor, 0);
          return sum ? <span className="tabular-nums">{sum > 0 ? '+' : '−'}{fmt.money(Math.abs(sum))}</span> : <span className="text-muted-foreground">—</span>;
        },
      },
      {
        id: 'net',
        header: 'Net pay',
        cell: ({ row }) => <span className={cn('font-medium tabular-nums', row.original.netMinor < 0 && 'text-destructive')}>{fmt.money(row.original.netMinor)}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {row.original.status === 'DRAFT' && can(Permission.PAYROLL_RUN) && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(row.original)}>
                Adjust
              </Button>
            )}
            <Link href={`/app/payroll/payslips/${row.original._id}`} className="text-primary px-2 py-1 text-xs hover:underline">
              Payslip
            </Link>
          </div>
        ),
      },
    ],
    [can, fmt],
  );

  if (query.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load this payroll run" />
      </div>
    );
  }
  const run = query.data;
  const stepIndex = STEPS.findIndex((s) => s.status === run.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Payroll — ${monthLabel(run.month)}`}
        description={run.publishedAt ? `Published ${fmt.date(run.publishedAt, true)} by ${fullName(run.publishedByUserId)}` : run.lockedAt ? `Locked ${fmt.date(run.lockedAt, true)}` : 'Draft — nothing is paid until you publish.'}
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Payroll', href: '/app/payroll' },
          { label: monthLabel(run.month) },
        ]}
        meta={<div className="pt-1"><StatusBadge {...RUN_STATUS[run.status]} /></div>}
        action={
          <PermissionGate permission={Permission.PAYROLL_RUN}>
            {run.status === 'DRAFT' && (
              <>
                <Button variant="ghost" onClick={() => setConfirm('discard')}>
                  <Trash2 className="size-4" />
                  Discard
                </Button>
                <Button variant="outline" onClick={() => action.mutate('recalculate')} disabled={action.isPending}>
                  <RefreshCw className={cn('size-4', action.isPending && action.variables === 'recalculate' && 'animate-spin')} />
                  Recalculate
                </Button>
                <Button onClick={() => setConfirm('lock')}>
                  <Lock className="size-4" />
                  Lock
                </Button>
              </>
            )}
            {run.status !== 'DRAFT' && (
              <Button variant="outline" onClick={() => downloadBankExport(run._id, run.month).catch((e) => toast.error(errorMessage(e, "Couldn't download the bank file")))}>
                <Download className="size-4" />
                Bank file
              </Button>
            )}
            {run.status === 'LOCKED' && (
              <Button onClick={() => setConfirm('publish')}>
                <Send className="size-4" />
                Publish
              </Button>
            )}
          </PermissionGate>
        }
      />

      <ol className="grid gap-2 sm:grid-cols-3" aria-label="Payroll progress">
        {STEPS.map((s, i) => {
          const done = i < stepIndex || run.status === 'PUBLISHED';
          const current = i === stepIndex && run.status !== 'PUBLISHED';
          return (
            <li key={s.status} aria-current={current ? 'step' : undefined} className={cn('flex items-center gap-3 rounded-lg border px-4 py-3', current && 'border-primary bg-primary/5')}>
              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium', done && 'border-success bg-success text-success-foreground', current && 'border-primary bg-primary text-primary-foreground')}>
                {done ? <Check className="animate-pop size-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <span>
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="text-muted-foreground block text-xs">{s.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Staff paid" value={run.employeeCount} />
        <StatCard label="Gross" value={fmt.money(run.grossMinor)} />
        <StatCard label="Deductions" value={fmt.money(run.deductionsMinor)} />
        <StatCard label="Net pay" value={fmt.money(run.netMinor)} tone="success" />
      </div>

      <DataTable
        columns={columns}
        data={run.payslips}
        getRowId={(p) => p._id}
        onRowClick={(p) => router.push(`/app/payroll/payslips/${p._id}`)}
        exportFileName={`payroll-${run.month}`}
        emptyTitle="No payslips"
        emptyDescription="Nobody had a salary set when this run was created. Set salaries, then recalculate."
      />

      <PayslipDialog slip={editing} onClose={() => setEditing(undefined)} onSaved={refresh} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'lock' ? 'Lock this payroll?' : confirm === 'publish' ? 'Publish payslips?' : 'Discard this draft?'}
        description={
          confirm === 'lock'
            ? 'Figures are frozen and advance instalments are recorded as recovered. This can’t be undone — corrections go in next month’s run.'
            : confirm === 'publish'
              ? `Staff can see their payslips and ${fmt.money(run.netMinor)} is posted to expenses under Salaries. Each staff member is emailed.`
              : 'The draft and its payslips are removed. You can start the month again.'
        }
        confirmLabel={confirm === 'lock' ? 'Lock payroll' : confirm === 'publish' ? 'Publish' : 'Discard draft'}
        destructive={confirm === 'discard'}
        pending={action.isPending}
        onConfirm={() => {
          if (confirm) action.mutate(confirm);
        }}
      />
    </div>
  );
}

function PayslipDialog({ slip, onClose, onSaved }: { slip?: Payslip; onClose: () => void; onSaved: () => Promise<void> }) {
  const fmt = useSchoolFormat();
  const form = useForm<{ unpaidLeaveDays: number; adjustments: { label: string; amountMinor: number; sign: '+' | '-' }[] }>({
    defaultValues: { unpaidLeaveDays: 0, adjustments: [] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'adjustments' });
  useEffect(() => {
    if (slip) {
      form.reset({
        unpaidLeaveDays: slip.unpaidLeaveDays,
        adjustments: slip.adjustments.map((a) => ({ label: a.label, amountMinor: Math.abs(a.amountMinor), sign: a.amountMinor < 0 ? '-' : '+' })),
      });
    }
  }, [slip, form]);
  const mutation = useMutation({
    mutationFn: (v: { unpaidLeaveDays: number; adjustments: { label: string; amountMinor: number; sign: '+' | '-' }[] }) =>
      updatePayslip(slip!._id, {
        unpaidLeaveDays: Number(v.unpaidLeaveDays) || 0,
        adjustments: v.adjustments.filter((a) => a.label.trim() && a.amountMinor > 0).map((a) => ({ label: a.label.trim(), amountMinor: a.sign === '-' ? -a.amountMinor : a.amountMinor })),
      }),
    onSuccess: async (updated) => {
      await onSaved();
      toast.success(`${updated.employee.name}: net ${fmt.money(updated.netMinor)}`);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't update the payslip")),
  });
  return (
    <Dialog open={Boolean(slip)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust {slip?.employee.name}</DialogTitle>
          <DialogDescription>Unpaid leave is deducted pro-rata from gross ({slip?.daysInMonth} days this month). Bonuses and penalties are separate lines.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} className="space-y-4">
          <Field
            label="Unpaid leave days"
            help={
              slip?.unpaidLeaveOverridden
                ? `Set by hand — the staff register says ${slip.attendanceUnpaidDays ?? 0}. Enter that to follow the register again.`
                : `From the staff register (absent and unpaid leave 1, half day ½). Changing it here keeps your number.`
            }
          >
            {({ id }) => <Input id={id} type="number" min={0} max={slip?.daysInMonth} step="0.5" className="w-32" {...form.register('unpaidLeaveDays')} />}
          </Field>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[0.8125rem] font-medium">Bonuses and penalties</legend>
            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[4.5rem_1fr_8rem_auto] gap-2">
                <select aria-label="Add or deduct" className="border-input h-9 rounded-lg border bg-transparent px-2 text-sm" {...form.register(`adjustments.${i}.sign`)}>
                  <option value="+">Add</option>
                  <option value="-">Deduct</option>
                </select>
                <Input aria-label="Label" placeholder="e.g. Exam duty bonus" {...form.register(`adjustments.${i}.label`)} />
                <Controller control={form.control} name={`adjustments.${i}.amountMinor`} render={({ field }) => <MoneyInput aria-label="Amount" value={field.value} onChange={field.onChange} />} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => remove(i)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => append({ label: '', amountMinor: 0, sign: '+' })}>
              <Plus className="size-3.5" />
              Add line
            </Button>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
