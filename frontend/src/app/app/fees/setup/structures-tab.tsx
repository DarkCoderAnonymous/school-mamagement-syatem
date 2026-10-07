'use client';

import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { MoneyInput } from '@/components/form/money-input';
import { useClassOptions } from '@/hooks/use-school-options';
import { useSchoolFormat } from '@/lib/format';
import { applyServerError } from '@/lib/form-errors';
import { createFeeStructure, listFeeHeads, listFeeStructures, updateFeeStructure } from '@/lib/api/finance';
import type { FeeStructure } from '@/lib/api/types';

export function FeeStructuresTab() {
  const fmt = useSchoolFormat();
  const classes = useClassOptions();
  const [dialog, setDialog] = useState<{ open: boolean; structure?: FeeStructure }>({ open: false });
  const query = useQuery({ queryKey: ['fee-structures'], queryFn: () => listFeeStructures({ limit: 100 }) });
  const structures = query.data?.items ?? [];
  const unpriced = (classes.data ?? []).filter((c) => !structures.some((s) => s.classId?._id === c._id));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">What each class pays this session. Editing a structure only affects invoices generated afterwards.</p>
        <PermissionGate permission={Permission.FEE_STRUCTURE_MANAGE}>
          <Button onClick={() => setDialog({ open: true })} disabled={unpriced.length === 0}>
            <Plus className="size-4" />
            New structure
          </Button>
        </PermissionGate>
      </div>

      {query.isLoading && <Skeleton className="h-48 w-full rounded-xl" />}
      {query.isError && (
        <div className="rounded-xl border">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load fee structures" />
        </div>
      )}
      {query.isSuccess && structures.length === 0 && (
        <div className="bg-card rounded-xl border">
          <EmptyState title="No fee structures yet" description="Set what each class pays — tuition, exam fee and so on — before generating invoices." />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {structures.map((s) => (
          <section key={s._id} className="bg-card space-y-3 rounded-xl border p-5">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{s.classId?.name ?? 'Class'}</h3>
                <p className="text-muted-foreground truncate text-xs">{s.name}</p>
              </div>
              <PermissionGate permission={Permission.FEE_STRUCTURE_MANAGE}>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => setDialog({ open: true, structure: s })}>
                  <Pencil className="size-4" />
                </Button>
              </PermissionGate>
            </header>
            <ul className="space-y-1.5 border-t pt-3 text-sm">
              {s.items.map((i, idx) => (
                <li key={idx} className="flex justify-between gap-3">
                  <span className="text-muted-foreground truncate">{i.feeHeadId?.name ?? 'Archived head'}</span>
                  <span className="tabular-nums">{fmt.money(i.amountMinor)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between border-t pt-3 text-sm font-semibold">
              <span>Total per bill</span>
              <span className="tabular-nums">{fmt.money(s.totalMinor)}</span>
            </p>
          </section>
        ))}
      </div>
      {unpriced.length > 0 && structures.length > 0 && (
        <p className="text-muted-foreground text-xs">No structure yet for: {unpriced.map((c) => c.name).join(', ')}.</p>
      )}

      <StructureDialog
        open={dialog.open}
        structure={dialog.structure}
        classOptions={dialog.structure ? [] : unpriced.map((c) => ({ value: c._id, label: c.name }))}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </div>
  );
}

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  classId: z.string(),
  items: z
    .array(z.object({ feeHeadId: z.string().min(1, 'Pick a fee'), amountMinor: z.number().int().min(0) }))
    .min(1, 'Add at least one fee'),
});
type Values = z.infer<typeof schema>;

function StructureDialog({
  open,
  structure,
  classOptions,
  onOpenChange,
}: {
  open: boolean;
  structure?: FeeStructure;
  classOptions: { value: string; label: string }[];
  onOpenChange: (o: boolean) => void;
}) {
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const heads = useQuery({ queryKey: ['fee-heads', 'all'], queryFn: () => listFeeHeads({ limit: 100 }), enabled: open });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', classId: '', items: [] } });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  const items = useWatch({ control: form.control, name: 'items' }) ?? [];
  const total = items.reduce((s, i) => s + (Number(i?.amountMinor) || 0), 0);

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: structure?.name ?? '',
      classId: structure?.classId?._id ?? classOptions[0]?.value ?? '',
      items: structure?.items.map((i) => ({ feeHeadId: i.feeHeadId?._id ?? '', amountMinor: i.amountMinor })) ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when opened for a structure
  }, [open, structure]);

  const mutation = useMutation({
    mutationFn: (v: Values) => {
      if (!structure && !v.classId) throw new Error('Pick a class');
      return structure
        ? updateFeeStructure(structure._id, { name: v.name, items: v.items })
        : createFeeStructure({ name: v.name || 'Fees', classId: v.classId, items: v.items });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fee-structures'] });
      toast.success(structure ? 'Fee structure updated' : 'Fee structure created');
      onOpenChange(false);
    },
    onError: (e) => applyServerError(e, form.setError, ['classId', 'items', 'name'], "Couldn't save the structure"),
  });
  const { errors, isSubmitting } = form.formState;
  const used = new Set(items.map((i) => i?.feeHeadId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{structure ? `Fees for ${structure.classId?.name ?? 'class'}` : 'New fee structure'}</DialogTitle>
          <DialogDescription>One amount per fee head, billed each time you generate invoices for this class.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {!structure && (
              <Field label="Class" error={errors.classId?.message} required>
                {({ id, describedBy }) => (
                  <NativeSelect id={id} aria-describedby={describedBy} {...form.register('classId')}>
                    {classOptions.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            )}
            <Field label="Name" error={errors.name?.message} required>
              {({ id, describedBy }) => <Input id={id} placeholder="e.g. Grade 5 fees 2026-27" aria-describedby={describedBy} {...form.register('name')} />}
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-[0.8125rem] font-medium">Fees</legend>
            {fields.map((f, idx) => (
              <div key={f.id} className="grid grid-cols-[1fr_9rem_auto] items-start gap-2">
                <NativeSelect aria-label="Fee head" {...form.register(`items.${idx}.feeHeadId`)}>
                  <option value="">Select a fee…</option>
                  {heads.data?.items.map((h) => (
                    <option key={h._id} value={h._id} disabled={used.has(h._id) && items[idx]?.feeHeadId !== h._id}>
                      {h.name}
                    </option>
                  ))}
                </NativeSelect>
                <Controller
                  control={form.control}
                  name={`items.${idx}.amountMinor`}
                  render={({ field }) => <MoneyInput aria-label="Amount" value={field.value} onChange={field.onChange} />}
                />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove fee" onClick={() => remove(idx)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {typeof errors.items?.message === 'string' && <p className="text-destructive text-xs">{errors.items.message}</p>}
            {heads.data?.items.length === 0 && <p className="text-muted-foreground text-xs">Create fee heads first, on the Fee heads tab.</p>}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!heads.data || used.size >= heads.data.items.length}
              onClick={() => append({ feeHeadId: heads.data?.items.find((h) => !used.has(h._id))?._id ?? '', amountMinor: 0 })}
            >
              <Plus className="size-3.5" />
              Add fee
            </Button>
          </fieldset>

          <p className="bg-muted/60 flex justify-between rounded-lg px-3 py-2 text-sm font-medium">
            <span>Total per bill</span>
            <span className="tabular-nums">{fmt.money(total)}</span>
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save structure'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
