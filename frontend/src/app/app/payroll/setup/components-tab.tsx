'use client';

import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { MoneyInput } from '@/components/form/money-input';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { createSalaryComponent, listSalaryComponents, updateSalaryComponent } from '@/lib/api/finance';
import type { ComponentCalculation, SalaryComponent } from '@/lib/api/types';

const CALC = { FIXED: 'Fixed amount', PERCENT_OF_BASIC: '% of basic', PERCENT_OF_GROSS: '% of gross' } as const;

export function ComponentsTab() {
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ['salary-components', 'all'], queryFn: () => listSalaryComponents({ limit: 100 }) });
  const toggle = useMutation({
    mutationFn: (c: SalaryComponent) => updateSalaryComponent(c._id, { isActive: !c.isActive }),
    onSuccess: async (c) => {
      await queryClient.invalidateQueries({ queryKey: ['salary-components'] });
      toast.success(`${c.name} ${c.isActive ? 'active' : 'inactive'}`);
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't update it")),
  });

  const columns = useMemo<DataTableColumn<SalaryComponent>[]>(
    () => [
      { id: 'name', header: 'Component', cell: ({ row }) => <span className="font-medium">{row.original.name} <span className="text-muted-foreground font-mono text-xs">{row.original.code}</span></span> },
      { id: 'type', header: 'Type', cell: ({ row }) => <StatusBadge status={row.original.type === 'EARNING' ? 'PAID' : 'SCHEDULED'} label={row.original.type === 'EARNING' ? 'Allowance' : 'Deduction'} /> },
      { id: 'calc', header: 'Calculated as', cell: ({ row }) => CALC[row.original.calculation] },
      { id: 'default', header: 'Default', cell: ({ row }) => <span className="tabular-nums">{row.original.calculation === 'FIXED' ? fmt.money(row.original.defaultValue) : `${row.original.defaultValue}%`}</span> },
      {
        id: 'active',
        header: 'Status',
        cell: ({ row }) =>
          can(Permission.PAYROLL_MANAGE) ? (
            <button type="button" className="text-xs hover:underline" onClick={() => toggle.mutate(row.original)}>
              <StatusBadge status={row.original.isActive ? 'ACTIVE' : 'DISABLED'} label={row.original.isActive ? 'Active' : 'Inactive'} />
            </button>
          ) : (
            <StatusBadge status={row.original.isActive ? 'ACTIVE' : 'DISABLED'} label={row.original.isActive ? 'Active' : 'Inactive'} />
          ),
      },
    ],
    [can, fmt, toggle],
  );

  const add = (
    <PermissionGate permission={Permission.PAYROLL_MANAGE}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New component
      </Button>
    </PermissionGate>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">Allowances and deductions — including tax as a % of gross. Each salary picks the ones that apply.</p>
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
        emptyTitle="No salary components yet"
        emptyDescription="Common ones: House rent (40% of basic), Medical (fixed), Provident fund (5% of basic), Income tax (% of gross)."
        emptyAction={add}
      />
      <ComponentDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function ComponentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const form = useForm<{ name: string; code: string; type: 'EARNING' | 'DEDUCTION'; calculation: ComponentCalculation; percent: number; fixedMinor: number }>();
  const calc = useWatch({ control: form.control, name: 'calculation' });
  const type = useWatch({ control: form.control, name: 'type' });
  useEffect(() => {
    if (open) form.reset({ name: '', code: '', type: 'EARNING', calculation: 'PERCENT_OF_BASIC', percent: 10, fixedMinor: 0 });
  }, [open, form]);
  const mutation = useMutation({
    mutationFn: (v: { name: string; code: string; type: 'EARNING' | 'DEDUCTION'; calculation: ComponentCalculation; percent: number; fixedMinor: number }) =>
      createSalaryComponent({ name: v.name, code: v.code, type: v.type, calculation: v.calculation, defaultValue: v.calculation === 'FIXED' ? v.fixedMinor : Number(v.percent) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['salary-components'] });
      toast.success('Component created');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't create the component")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New salary component</DialogTitle>
          <DialogDescription>Type and calculation can’t change later — make a new component instead.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field label="Name" required>{({ id }) => <Input id={id} autoFocus required {...form.register('name', { required: true })} />}</Field>
            <Field label="Code" required>{({ id }) => <Input id={id} className="font-mono uppercase" required pattern="[A-Za-z0-9-]+" {...form.register('code', { required: true })} />}</Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              {({ id }) => (
                <NativeSelect id={id} {...form.register('type')}>
                  <option value="EARNING">Allowance (adds)</option>
                  <option value="DEDUCTION">Deduction (subtracts)</option>
                </NativeSelect>
              )}
            </Field>
            <Field label="Calculated as">
              {({ id }) => (
                <NativeSelect id={id} {...form.register('calculation')}>
                  <option value="FIXED">Fixed amount</option>
                  <option value="PERCENT_OF_BASIC">% of basic</option>
                  <option value="PERCENT_OF_GROSS" disabled={type === 'EARNING'}>% of gross (deductions only)</option>
                </NativeSelect>
              )}
            </Field>
          </div>
          {calc === 'FIXED' ? (
            <Field label="Default amount">{({ id }) => <Controller control={form.control} name="fixedMinor" render={({ field }) => <MoneyInput id={id} value={field.value} onChange={field.onChange} />} />}</Field>
          ) : (
            <Field label="Default percent">{({ id }) => <Input id={id} type="number" min={0} max={100} step="0.5" className="w-32" {...form.register('percent')} />}</Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
