'use client';

import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { MoneyInput } from '@/components/form/money-input';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { applyServerError } from '@/lib/form-errors';
import { getFeeSettings, updateFeeSettings } from '@/lib/api/finance';

const code = z.string().trim().min(1, 'Required').max(12).regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only');
const schema = z.object({
  lateFineType: z.enum(['NONE', 'FLAT', 'PER_DAY']),
  lateFineAmountMinor: z.number().int().min(0),
  graceDays: z.coerce.number().int().min(0).max(90),
  maxFineMinor: z.number().int().min(0),
  invoicePrefix: code,
  receiptPrefix: code,
});
type Values = z.infer<typeof schema>;

export function FeeSettingsTab() {
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const readOnly = !can(Permission.FEE_STRUCTURE_MANAGE);
  const query = useQuery({ queryKey: ['fee-settings'], queryFn: getFeeSettings });
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const type = useWatch({ control: form.control, name: 'lateFineType' });
  const amount = useWatch({ control: form.control, name: 'lateFineAmountMinor' });
  const grace = useWatch({ control: form.control, name: 'graceDays' });

  useEffect(() => {
    if (query.data) form.reset(query.data);
  }, [query.data, form]);

  const mutation = useMutation({
    mutationFn: updateFeeSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fee-settings'] });
      toast.success('Fee settings saved');
    },
    onError: (e) => applyServerError(e, form.setError, ['invoicePrefix', 'receiptPrefix'], "Couldn't save the settings"),
  });

  if (query.isLoading) return <Skeleton className="h-72 w-full max-w-2xl rounded-xl" />;
  const { errors, isSubmitting, isDirty } = form.formState;
  const example =
    type === 'FLAT'
      ? `An invoice ${Number(grace) + 1} days late gets a one-time ${fmt.money(amount || 0)} fine.`
      : type === 'PER_DAY'
        ? `An invoice 10 days late gets ${fmt.money((amount || 0) * Math.max(0, 10 - Number(grace)))} (${fmt.money(amount || 0)} a day after ${grace || 0} grace days).`
        : 'Overdue invoices are never fined automatically.';

  return (
    <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="max-w-2xl space-y-6">
      <section className="bg-card space-y-4 rounded-xl border p-5">
        <div>
          <h3 className="font-semibold">Late fines</h3>
          <p className="text-muted-foreground text-sm">
            Applied when you run “Apply late fines” on the invoices page, using the school’s timezone ({query.data?.timezone}).
          </p>
        </div>
        <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
          <Field label="Rule">
            {({ id }) => (
              <NativeSelect id={id} {...form.register('lateFineType')}>
                <option value="NONE">No late fines</option>
                <option value="FLAT">Flat fine, once</option>
                <option value="PER_DAY">Per day overdue</option>
              </NativeSelect>
            )}
          </Field>
          {type !== 'NONE' && (
            <>
              <Field label={type === 'FLAT' ? 'Fine' : 'Fine per day'}>
                {({ id }) => <Controller control={form.control} name="lateFineAmountMinor" render={({ field }) => <MoneyInput id={id} value={field.value} onChange={field.onChange} />} />}
              </Field>
              <Field label="Grace days" error={errors.graceDays?.message} help="Days after the due date before any fine.">
                {({ id, describedBy }) => <Input id={id} type="number" min={0} aria-describedby={describedBy} {...form.register('graceDays')} />}
              </Field>
              {type === 'PER_DAY' && (
                <Field label="Maximum fine" help="0 means no cap.">
                  {({ id }) => <Controller control={form.control} name="maxFineMinor" render={({ field }) => <MoneyInput id={id} value={field.value} onChange={field.onChange} />} />}
                </Field>
              )}
            </>
          )}
        </fieldset>
        <p className="bg-muted/60 rounded-lg px-3 py-2 text-sm">{example}</p>
      </section>

      <section className="bg-card space-y-4 rounded-xl border p-5">
        <div>
          <h3 className="font-semibold">Numbering</h3>
          <p className="text-muted-foreground text-sm">Numbers run per school and per year, e.g. {form.getValues('invoicePrefix') || 'INV'}-2026-00001.</p>
        </div>
        <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice prefix" error={errors.invoicePrefix?.message}>
            {({ id, describedBy }) => <Input id={id} className="font-mono uppercase" aria-describedby={describedBy} {...form.register('invoicePrefix')} />}
          </Field>
          <Field label="Receipt prefix" error={errors.receiptPrefix?.message}>
            {({ id, describedBy }) => <Input id={id} className="font-mono uppercase" aria-describedby={describedBy} {...form.register('receiptPrefix')} />}
          </Field>
        </fieldset>
      </section>

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      )}
    </form>
  );
}
