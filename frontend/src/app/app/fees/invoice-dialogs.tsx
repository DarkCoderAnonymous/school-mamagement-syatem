'use client';

import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { MoneyInput } from '@/components/form/money-input';
import { StudentPicker } from '@/components/data/student-picker';
import { useSchoolFormat } from '@/lib/format';
import { applyServerError } from '@/lib/form-errors';
import { adjustInvoice, createInvoice } from '@/lib/api/finance';
import type { FeeInvoiceDetail, Student } from '@/lib/api/types';

const adjustSchema = z.object({
  type: z.enum(['DISCOUNT', 'FINE']),
  amountMinor: z.number().int().min(1, 'Enter an amount'),
  reason: z.string().trim().min(3, 'Give a reason').max(200),
});
type AdjustValues = z.infer<typeof adjustSchema>;

export function AdjustInvoiceDialog({ invoice, open, onOpenChange }: { invoice: FeeInvoiceDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const form = useForm<AdjustValues>({ resolver: zodResolver(adjustSchema) });
  useEffect(() => {
    if (open) form.reset({ type: 'DISCOUNT', amountMinor: 0, reason: '' });
  }, [open, form]);
  const mutation = useMutation({
    mutationFn: (v: AdjustValues) => adjustInvoice(invoice._id, v),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['fee-invoices'] });
      toast.success(`Invoice now ${fmt.money(updated.totalMinor)}`);
      onOpenChange(false);
    },
    onError: (e) => applyServerError(e, form.setError, ['amountMinor'], "Couldn't adjust the invoice"),
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust {invoice.invoiceNumber}</DialogTitle>
          <DialogDescription>A one-off discount (up to the {fmt.money(invoice.balanceMinor)} still owed) or an extra fine, with a reason for the record.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              {({ id }) => (
                <NativeSelect id={id} {...form.register('type')}>
                  <option value="DISCOUNT">Discount</option>
                  <option value="FINE">Fine</option>
                </NativeSelect>
              )}
            </Field>
            <Field label="Amount" error={errors.amountMinor?.message} required>
              {({ id, describedBy }) => (
                <Controller control={form.control} name="amountMinor" render={({ field }) => <MoneyInput id={id} aria-describedby={describedBy} value={field.value} onChange={field.onChange} />} />
              )}
            </Field>
          </div>
          <Field label="Reason" error={errors.reason?.message} required>
            {({ id, describedBy }) => <Input id={id} placeholder="e.g. Hardship waiver approved by principal" aria-describedby={describedBy} aria-invalid={!!errors.reason} {...form.register('reason')} />}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Apply'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const invoiceSchema = z.object({
  periodLabel: z.string().trim().min(1, 'Label is required').max(60),
  dueDate: z.string().min(1, 'Due date is required'),
  applyConcessions: z.boolean(),
  lines: z.array(z.object({ name: z.string().trim().min(1, 'Required').max(80), amountMinor: z.number().int().min(1, 'Enter an amount') })).min(1),
});
type InvoiceValues = z.infer<typeof invoiceSchema>;

/** A one-off bill for one student — admission fee, replacement ID card, trip. */
export function NewInvoiceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [student, setStudent] = useState<Student | null>(null);
  const [studentError, setStudentError] = useState<string>();
  const form = useForm<InvoiceValues>({ resolver: zodResolver(invoiceSchema) });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
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
    form.reset({ periodLabel: '', dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10), applyConcessions: false, lines: [{ name: '', amountMinor: 0 }] });
  }, [open, form]);
  const mutation = useMutation({
    mutationFn: (v: InvoiceValues) => createInvoice({ ...v, studentId: student!._id }),
    onSuccess: async (inv) => {
      await queryClient.invalidateQueries({ queryKey: ['fee-invoices'] });
      toast.success(`${inv.invoiceNumber} created`);
      onOpenChange(false);
      router.push(`/app/fees/invoices/${inv._id}`);
    },
    onError: (e) => applyServerError(e, form.setError, ['periodLabel', 'dueDate'], "Couldn't create the invoice"),
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>One-off invoice</DialogTitle>
          <DialogDescription>For charges outside the regular runs — an admission fee, a trip, a replacement ID card.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => {
            if (!student) return setStudentError('Pick a student');
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
            <Field label="Label on the bill" error={errors.periodLabel?.message} required>
              {({ id, describedBy }) => <Input id={id} placeholder="e.g. Admission 2026" aria-describedby={describedBy} {...form.register('periodLabel')} />}
            </Field>
            <Field label="Due date" error={errors.dueDate?.message} required>
              {({ id, describedBy }) => <Input id={id} type="date" aria-describedby={describedBy} {...form.register('dueDate')} />}
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[0.8125rem] font-medium">Charges</legend>
            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_9rem_auto] gap-2">
                <Input aria-label="Charge" placeholder="What it's for" {...form.register(`lines.${i}.name`)} aria-invalid={!!errors.lines?.[i]?.name} />
                <Controller control={form.control} name={`lines.${i}.amountMinor`} render={({ field }) => <MoneyInput aria-label="Amount" value={field.value} onChange={field.onChange} />} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove charge" disabled={fields.length === 1} onClick={() => remove(i)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => append({ name: '', amountMinor: 0 })}>
              <Plus className="size-3.5" />
              Add charge
            </Button>
          </fieldset>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" className="accent-primary size-4" {...form.register('applyConcessions')} />
            Apply the student’s standing concessions
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
