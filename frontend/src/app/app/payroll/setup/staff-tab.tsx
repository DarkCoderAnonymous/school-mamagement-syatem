'use client';

import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { MoneyInput } from '@/components/form/money-input';
import { useUrlState } from '@/hooks/use-url-state';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName, roleLabel } from '@/lib/labels';
import {
  addStaffToPayroll,
  createSalaryStructure,
  listPayrollCandidates,
  listPayrollStaff,
  listSalaryComponents,
  updateSalaryStructure,
} from '@/lib/api/finance';
import type { PayrollStaff, SalaryComponent } from '@/lib/api/types';

export function StaffSalariesTab() {
  const url = useUrlState();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const [editing, setEditing] = useState<PayrollStaff>();
  const [adding, setAdding] = useState(false);
  const params = { page: url.getNumber('page', 1), limit: 25, search: url.get('search') };
  const query = useQuery({ queryKey: ['payroll-staff', params], queryFn: () => listPayrollStaff(params) });

  const columns = useMemo<DataTableColumn<PayrollStaff>[]>(
    () => [
      {
        id: 'name',
        header: 'Staff member',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{fullName(row.original)}</p>
            <p className="text-muted-foreground text-xs">
              <span className="font-mono">{row.original.employeeNumber}</span> · {row.original.designation}
            </p>
          </div>
        ),
      },
      {
        id: 'basic',
        header: 'Basic',
        cell: ({ row }) => (row.original.structure ? <span className="tabular-nums">{fmt.money(row.original.structure.basicMinor)}</span> : <StatusBadge status="PENDING" label="Not set" />),
      },
      { id: 'gross', header: 'Monthly gross', cell: ({ row }) => (row.original.monthlyGrossMinor !== null ? <span className="tabular-nums">{fmt.money(row.original.monthlyGrossMinor)}</span> : '—') },
      { id: 'net', header: 'Monthly net', cell: ({ row }) => (row.original.monthlyNetMinor !== null ? <span className="font-medium tabular-nums">{fmt.money(row.original.monthlyNetMinor)}</span> : '—') },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) =>
          can(Permission.PAYROLL_MANAGE) ? (
            <div className="flex justify-end">
              <Button variant={row.original.structure ? 'ghost' : 'outline'} size="sm" onClick={() => setEditing(row.original)}>
                {row.original.structure ? 'Edit salary' : 'Set salary'}
              </Button>
            </div>
          ) : null,
      },
    ],
    [can, fmt],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">Teachers are on payroll automatically. Office staff and leadership are added here.</p>
        <PermissionGate permission={Permission.PAYROLL_MANAGE}>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" />
            Add staff to payroll
          </Button>
        </PermissionGate>
      </div>
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        getRowId={(r) => r._id}
        emptyTitle="Nobody on payroll yet"
        emptyDescription="Add teachers from the Teachers page, or office staff with “Add staff to payroll”."
        toolbar={<FilterBar searchPlaceholder="Search name, number or designation…" />}
      />
      <SalaryDialog staff={editing} onClose={() => setEditing(undefined)} />
      <AddStaffDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}

interface SalaryValues {
  basicMinor: number;
  components: Record<string, { on: boolean; value: number }>;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
}

/** The same arithmetic the server uses, for a live preview while typing. */
function preview(basic: number, comps: SalaryComponent[], chosen: SalaryValues['components']) {
  const amt = (c: SalaryComponent, gross: number) => {
    const v = Number(chosen[c._id]?.value) || 0;
    return c.calculation === 'FIXED' ? v : Math.round(((c.calculation === 'PERCENT_OF_GROSS' ? gross : basic) * v) / 100);
  };
  const active = comps.filter((c) => chosen[c._id]?.on);
  const gross = basic + active.filter((c) => c.type === 'EARNING').reduce((s, c) => s + amt(c, 0), 0);
  const deductions = active.filter((c) => c.type === 'DEDUCTION').reduce((s, c) => s + amt(c, gross), 0);
  return { gross, deductions, net: gross - deductions };
}

function SalaryDialog({ staff, onClose }: { staff?: PayrollStaff; onClose: () => void }) {
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const comps = useQuery({ queryKey: ['salary-components', 'all'], queryFn: () => listSalaryComponents({ limit: 100 }), enabled: Boolean(staff) });
  const list = useMemo(() => (comps.data?.items ?? []).filter((c) => c.isActive), [comps.data]);
  const form = useForm<SalaryValues>({ defaultValues: { basicMinor: 0, components: {}, bankName: '', accountTitle: '', accountNumber: '' } });
  const values = useWatch({ control: form.control }) as SalaryValues;

  useEffect(() => {
    if (!staff || !comps.data) return;
    const s = staff.structure;
    const components: SalaryValues['components'] = {};
    for (const c of comps.data.items) {
      const existing = s?.components.find((x) => x.componentId === c._id);
      components[c._id] = { on: Boolean(existing) || (!s && c.isActive), value: existing?.value ?? c.defaultValue };
    }
    form.reset({ basicMinor: s?.basicMinor ?? 0, components, bankName: s?.bankName ?? '', accountTitle: s?.accountTitle ?? fullName(staff), accountNumber: s?.accountNumber ?? '' });
  }, [staff, comps.data, form]);

  const mutation = useMutation({
    mutationFn: (v: SalaryValues) => {
      const payload = {
        basicMinor: v.basicMinor,
        components: Object.entries(v.components).filter(([, c]) => c.on).map(([componentId, c]) => ({ componentId, value: Number(c.value) || 0 })),
        bankName: v.bankName || undefined,
        accountTitle: v.accountTitle || undefined,
        accountNumber: v.accountNumber || undefined,
      };
      return staff!.structure ? updateSalaryStructure(staff!.structure._id, payload) : createSalaryStructure({ ...payload, employeeId: staff!._id });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payroll-staff'] });
      toast.success(`Salary saved for ${fullName(staff)}`, { description: 'Applies from the next payroll run (or recalculate a draft).' });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't save the salary")),
  });

  const p = preview(Number(values?.basicMinor) || 0, list, values?.components ?? {});

  return (
    <Dialog open={Boolean(staff)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Salary — {fullName(staff)}</DialogTitle>
          <DialogDescription>Monthly basic plus the allowances and deductions that apply. Percentages are of basic unless marked “of gross”.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} className="space-y-5">
          <Field label="Basic pay (monthly)" required>
            {({ id }) => <Controller control={form.control} name="basicMinor" render={({ field }) => <MoneyInput id={id} value={field.value} onChange={field.onChange} />} />}
          </Field>

          {(['EARNING', 'DEDUCTION'] as const).map((type) => (
            <fieldset key={type} className="space-y-2">
              <legend className="mb-1 text-[0.8125rem] font-medium">{type === 'EARNING' ? 'Allowances' : 'Deductions'}</legend>
              {list.filter((c) => c.type === type).length === 0 && <p className="text-muted-foreground text-xs">None defined — add them on the Components tab.</p>}
              {list
                .filter((c) => c.type === type)
                .map((c) => (
                  <div key={c._id} className="grid grid-cols-[1fr_8rem] items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="accent-primary size-4" {...form.register(`components.${c._id}.on`)} />
                      {c.name}
                      <span className="text-muted-foreground text-xs">
                        {c.calculation === 'FIXED' ? 'fixed' : c.calculation === 'PERCENT_OF_GROSS' ? '% of gross' : '% of basic'}
                      </span>
                    </label>
                    {c.calculation === 'FIXED' ? (
                      <Controller control={form.control} name={`components.${c._id}.value`} render={({ field }) => <MoneyInput aria-label={`${c.name} amount`} value={field.value} onChange={field.onChange} />} />
                    ) : (
                      <Input type="number" min={0} max={100} step="0.5" aria-label={`${c.name} percent`} {...form.register(`components.${c._id}.value`)} />
                    )}
                  </div>
                ))}
            </fieldset>
          ))}

          <dl className="bg-muted/60 grid grid-cols-3 gap-2 rounded-lg p-3 text-sm" aria-live="polite">
            <div>
              <dt className="text-muted-foreground text-xs">Gross</dt>
              <dd className="font-medium tabular-nums">{fmt.money(p.gross)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Deductions</dt>
              <dd className="font-medium tabular-nums">{fmt.money(p.deductions)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Net (before leave/advances)</dt>
              <dd className="font-semibold tabular-nums">{fmt.money(p.net)}</dd>
            </div>
          </dl>

          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-[0.8125rem] font-medium">Bank details (for the transfer file)</legend>
            <Input aria-label="Bank" placeholder="Bank" {...form.register('bankName')} />
            <Input aria-label="Account title" placeholder="Account title" {...form.register('accountTitle')} />
            <Input aria-label="Account number" placeholder="Account / IBAN" className="font-mono" {...form.register('accountNumber')} />
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save salary'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddStaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const candidates = useQuery({ queryKey: ['payroll-candidates'], queryFn: listPayrollCandidates, enabled: open });
  const [membershipId, setMembershipId] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('');
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().slice(0, 10));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMembershipId('');
      setDesignation('');
      setDepartment('');
    }
  }
  const pickMember = (id: string) => {
    setMembershipId(id);
    // Suggest a designation from their role, unless one was typed already.
    const c = candidates.data?.find((x) => x.membershipId === id);
    if (c && !designation.trim()) setDesignation(roleLabel(c.roles[0] ?? 'Staff'));
  };
  const mutation = useMutation({
    mutationFn: () => addStaffToPayroll({ membershipId, designation, department: department || undefined, joiningDate }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payroll-staff'] });
      await queryClient.invalidateQueries({ queryKey: ['payroll-candidates'] });
      toast.success('Added to payroll — set their salary next');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't add them to payroll")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add staff to payroll</DialogTitle>
          <DialogDescription>For staff invited under Staff & roles — principal, accountant, office. They get an employee number.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Staff member" required help={candidates.data?.length === 0 ? 'Everyone with a staff account is already on payroll.' : undefined}>
            {({ id, describedBy }) => (
              <NativeSelect id={id} aria-describedby={describedBy} value={membershipId} onChange={(e) => pickMember(e.target.value)}>
                <option value="">{candidates.isLoading ? 'Loading…' : 'Select…'}</option>
                {candidates.data?.map((c) => (
                  <option key={c.membershipId} value={c.membershipId}>
                    {fullName(c.user)} — {c.roles.map(roleLabel).join(', ')}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Designation" required>{({ id }) => <Input id={id} value={designation} onChange={(e) => setDesignation(e.target.value)} />}</Field>
            <Field label="Department">{({ id }) => <Input id={id} value={department} onChange={(e) => setDepartment(e.target.value)} />}</Field>
          </div>
          <Field label="Joining date" required>{({ id }) => <Input id={id} type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />}</Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!membershipId || !designation.trim() || mutation.isPending}>
            {mutation.isPending ? 'Adding…' : 'Add to payroll'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
