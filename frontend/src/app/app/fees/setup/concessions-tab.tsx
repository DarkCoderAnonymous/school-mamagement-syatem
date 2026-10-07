'use client';

import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { StudentPicker } from '@/components/data/student-picker';
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
import { applyServerError, errorMessage } from '@/lib/form-errors';
import { fullName } from '@/lib/labels';
import { createConcession, deleteConcession, listConcessions, listFeeHeads } from '@/lib/api/finance';
import type { FeeConcession, Student } from '@/lib/api/types';
import { StudentLink } from '@/components/students/student-quick-view';

const KIND = { DISCOUNT: 'Discount', SCHOLARSHIP: 'Scholarship', SIBLING: 'Sibling' } as const;

export function ConcessionsTab() {
  const url = useUrlState();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<FeeConcession>();
  const params = { page: url.getNumber('page', 1), limit: 25, search: url.get('search') };
  const query = useQuery({ queryKey: ['fee-concessions', params], queryFn: () => listConcessions(params) });

  const remove = useMutation({
    mutationFn: (c: FeeConcession) => deleteConcession(c._id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fee-concessions'] });
      toast.success('Concession removed');
      setRemoving(undefined);
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't remove it")),
  });

  const columns = useMemo<DataTableColumn<FeeConcession>[]>(
    () => [
      {
        id: 'student',
        header: 'Student',
        cell: ({ row }) => (
          <div className="min-w-0">
            <StudentLink studentId={row.original.studentId?._id} tab="fees" className="block truncate font-medium">
              {fullName(row.original.studentId)}
            </StudentLink>
            <p className="text-muted-foreground text-xs">
              {row.original.studentId?.admissionNumber} · {row.original.studentId?.classId?.name}
            </p>
          </div>
        ),
      },
      { id: 'name', header: 'Concession', cell: ({ row }) => row.original.name },
      { id: 'kind', header: 'Kind', cell: ({ row }) => <StatusBadge status="SCHEDULED" label={KIND[row.original.kind]} /> },
      {
        id: 'value',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.type === 'PERCENT' ? `${row.original.value}%` : fmt.money(row.original.value)}
            <span className="text-muted-foreground"> off {row.original.feeHeadId?.name ?? 'all fees'}</span>
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) =>
          can(Permission.FEE_CONCESSION_MANAGE) ? (
            <div className="flex justify-end">
              <Button variant="ghost" size="icon-sm" aria-label="Remove concession" onClick={() => setRemoving(row.original)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [can, fmt],
  );

  const add = (
    <PermissionGate permission={Permission.FEE_CONCESSION_MANAGE}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Grant concession
      </Button>
    </PermissionGate>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">Standing reductions applied every time a student’s invoices are generated.</p>
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
        emptyTitle={params.search ? 'No concessions match' : 'No concessions yet'}
        emptyDescription="Scholarships, staff-child discounts and sibling concessions go here."
        emptyAction={params.search ? undefined : add}
        toolbar={<FilterBar searchPlaceholder="Search student or concession…" />}
      />
      <ConcessionDialog open={open} onOpenChange={setOpen} />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(undefined)}
        title="Remove this concession?"
        description="Future invoices won't include it. Invoices already issued keep their amounts."
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </div>
  );
}

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    kind: z.enum(['DISCOUNT', 'SCHOLARSHIP', 'SIBLING']),
    type: z.enum(['PERCENT', 'FIXED']),
    percent: z.coerce.number().min(0).max(100, 'At most 100%'),
    fixedMinor: z.number().int().min(0),
    feeHeadId: z.string(),
  })
  .refine((v) => (v.type === 'PERCENT' ? v.percent > 0 : v.fixedMinor > 0), { message: 'Enter an amount', path: ['percent'] });
type Values = z.infer<typeof schema>;

function ConcessionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [student, setStudent] = useState<Student | null>(null);
  const [studentError, setStudentError] = useState<string>();
  const heads = useQuery({ queryKey: ['fee-heads', 'all'], queryFn: () => listFeeHeads({ limit: 100 }), enabled: open });
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const type = useWatch({ control: form.control, name: 'type' });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStudent(null);
      setStudentError(undefined);
    }
  }
  useEffect(() => {
    if (!open) return;
    form.reset({ name: '', kind: 'DISCOUNT', type: 'PERCENT', percent: 10, fixedMinor: 0, feeHeadId: '' });
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: (v: Values) =>
      createConcession({
        studentId: student!._id,
        name: v.name,
        kind: v.kind,
        type: v.type,
        value: v.type === 'PERCENT' ? v.percent : v.fixedMinor,
        feeHeadId: v.feeHeadId || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fee-concessions'] });
      toast.success('Concession granted');
      onOpenChange(false);
    },
    onError: (e) => applyServerError(e, form.setError, ['name', 'feeHeadId'], "Couldn't grant the concession"),
  });
  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Grant a concession</DialogTitle>
          <DialogDescription>Applies from the next invoice generated for this student.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => {
            if (!student) {
              setStudentError('Pick a student');
              return;
            }
            return mutation.mutateAsync(v);
          })}
          noValidate
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <p className="text-[0.8125rem] font-medium">Student</p>
            <StudentPicker value={student} onChange={(s) => { setStudent(s); setStudentError(undefined); }} autoFocus />
            {studentError && <p className="text-destructive text-xs">{studentError}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={errors.name?.message} required>
              {({ id, describedBy }) => <Input id={id} placeholder="e.g. Merit scholarship" aria-describedby={describedBy} {...form.register('name')} />}
            </Field>
            <Field label="Kind">
              {({ id }) => (
                <NativeSelect id={id} {...form.register('kind')}>
                  {Object.entries(KIND).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Type">
              {({ id }) => (
                <NativeSelect id={id} {...form.register('type')}>
                  <option value="PERCENT">Percentage</option>
                  <option value="FIXED">Fixed amount</option>
                </NativeSelect>
              )}
            </Field>
            {type === 'FIXED' ? (
              <Field label="Amount off" error={errors.percent?.message}>
                {({ id, describedBy }) => (
                  <Controller control={form.control} name="fixedMinor" render={({ field }) => <MoneyInput id={id} aria-describedby={describedBy} value={field.value} onChange={field.onChange} />} />
                )}
              </Field>
            ) : (
              <Field label="Percent off" error={errors.percent?.message}>
                {({ id, describedBy }) => <Input id={id} type="number" min={0} max={100} step="0.5" aria-describedby={describedBy} {...form.register('percent')} />}
              </Field>
            )}
          </div>
          <Field label="Applies to" help="One fee head, or every fee on the invoice.">
            {({ id, describedBy }) => (
              <NativeSelect id={id} aria-describedby={describedBy} {...form.register('feeHeadId')}>
                <option value="">All fees</option>
                {heads.data?.items.map((h) => (
                  <option key={h._id} value={h._id}>
                    {h.name} only
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Grant concession'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
