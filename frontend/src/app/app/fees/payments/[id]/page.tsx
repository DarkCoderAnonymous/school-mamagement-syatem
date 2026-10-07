'use client';

import { Suspense, use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Undo2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/auth/permission-gate';
import { PrintLayout } from '@/components/print/print-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { MoneyInput } from '@/components/form/money-input';
import { useSchoolFormat } from '@/lib/format';
import { applyServerError } from '@/lib/form-errors';
import { fullName, PAYMENT_METHOD_LABEL } from '@/lib/labels';
import { getPayment, refundPayment, reversePayment } from '@/lib/api/finance';
import type { FeePayment, PaymentMethod } from '@/lib/api/types';
import { StudentLink } from '@/components/students/student-quick-view';

function Receipt({ id }: { id: string }) {
  const fmt = useSchoolFormat();
  const search = useSearchParams();
  const printed = useRef(false);
  const [dialog, setDialog] = useState<'refund' | 'reverse' | null>(null);
  const query = useQuery({ queryKey: ['fee-payments', id], queryFn: () => getPayment(id) });

  // Straight from the collect screen: open the print dialog once the receipt has rendered.
  useEffect(() => {
    if (query.data && search.get('print') === '1' && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [query.data, search]);

  if (query.isLoading) return <Skeleton className="mx-auto h-96 max-w-3xl rounded-xl" />;
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load this receipt" />
      </div>
    );
  }
  const p = query.data;
  const reversed = p.status === 'REVERSED';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="print:hidden">
        <PageHeader
          title={`Receipt ${p.receiptNumber}`}
          description={`${fullName(p.studentId)} · ${fmt.date(p.paidAt, true)}`}
          breadcrumbs={[
            { label: 'Dashboard', href: '/app' },
            { label: 'Receipts', href: '/app/fees/payments' },
            { label: p.receiptNumber },
          ]}
          meta={reversed ? <div className="pt-1"><StatusBadge status="CANCELLED" label="Reversed" /></div> : undefined}
          action={
            <>
              {!reversed && (
                <PermissionGate permission={Permission.FEE_PAYMENT_REFUND}>
                  {p.netMinor > 0 && (
                    <Button variant="ghost" onClick={() => setDialog('refund')}>
                      <Undo2 className="size-4" />
                      Refund
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setDialog('reverse')}>
                    <Ban className="size-4" />
                    Reverse
                  </Button>
                </PermissionGate>
              )}
              <Button onClick={() => window.print()}>
                <Printer className="size-4" />
                Print
              </Button>
            </>
          }
        />
      </div>

      <PrintLayout
        title={reversed ? 'Fee receipt — REVERSED' : 'Fee receipt'}
        schoolName={p.schoolName ?? 'School'}
        meta={[
          { label: 'Receipt no.', value: <span className="font-mono">{p.receiptNumber}</span> },
          { label: 'Date', value: fmt.date(p.paidAt, true) },
          {
            label: 'Student',
            value: (
              <StudentLink studentId={p.studentId?._id} tab="fees">
                {fullName(p.studentId)}
              </StudentLink>
            ),
          },
          { label: 'Admission no.', value: <span className="font-mono">{p.studentId?.admissionNumber}</span> },
          { label: 'Class', value: `${p.studentId?.classId?.name ?? '—'}${p.studentId?.sectionId ? ` · ${p.studentId.sectionId.name}` : ''}` },
          { label: 'Paid by', value: `${PAYMENT_METHOD_LABEL[p.method]}${p.reference ? ` · ${p.reference}` : ''}` },
        ]}
        footer={`Received by ${fullName(p.receivedByUserId)}. This is a computer-generated receipt.`}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs print:text-black">
              <th className="py-2 font-medium">Invoice</th>
              <th className="py-2 font-medium">For</th>
              <th className="py-2 text-right font-medium">Paid</th>
            </tr>
          </thead>
          <tbody>
            {p.allocations.map((a, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2 font-mono text-xs">
                  {a.invoiceId ? (
                    <Link href={`/app/fees/invoices/${a.invoiceId._id}`} className="hover:text-primary print:no-underline">
                      {a.invoiceId.invoiceNumber}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2">{a.invoiceId?.periodLabel}</td>
                <td className="py-2 text-right tabular-nums">{fmt.money(a.amountMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <dt>Amount received</dt>
            <dd className="tabular-nums">{fmt.money(p.amountMinor)}</dd>
          </div>
          {p.refunds.map((r, i) => (
            <div key={i} className="flex justify-between">
              <dt>Refunded {fmt.date(r.at)}</dt>
              <dd className="tabular-nums">−{fmt.money(r.amountMinor)}</dd>
            </div>
          ))}
          {p.refundedMinor > 0 && (
            <div className="flex justify-between border-t pt-1.5 font-semibold">
              <dt>Net paid</dt>
              <dd className="tabular-nums">{fmt.money(p.netMinor)}</dd>
            </div>
          )}
        </dl>
        {reversed && (
          <p className="rounded-md border border-dashed p-3 text-sm">
            Reversed on {fmt.date(p.reversedAt)} by {fullName(p.reversedByUserId)}: {p.reversalReason}
          </p>
        )}
      </PrintLayout>

      {p.refunds.length > 0 && (
        <section className="bg-card space-y-2 rounded-xl border p-5 print:hidden">
          <h2 className="text-sm font-semibold">Refund history</h2>
          {p.refunds.map((r, i) => (
            <p key={i} className="text-muted-foreground text-sm">
              {fmt.date(r.at, true)} · {fmt.money(r.amountMinor)} by {PAYMENT_METHOD_LABEL[r.method]} — {r.reason} ({fullName(r.byUserId)})
            </p>
          ))}
        </section>
      )}

      <MoneyBackDialog payment={p} mode={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

const schema = z.object({
  amountMinor: z.number().int().min(0),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE']),
  reason: z.string().trim().min(3, 'Give a reason').max(200),
});
type Values = z.infer<typeof schema>;

function MoneyBackDialog({ payment, mode, onClose }: { payment: FeePayment; mode: 'refund' | 'reverse' | null; onClose: () => void }) {
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (mode) form.reset({ amountMinor: payment.netMinor, method: payment.method, reason: '' });
  }, [mode, payment, form]);
  const mutation = useMutation({
    mutationFn: (v: Values) =>
      mode === 'refund'
        ? refundPayment(payment._id, { amountMinor: v.amountMinor, method: v.method as PaymentMethod, reason: v.reason })
        : reversePayment(payment._id, v.reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fee-payments'] });
      await queryClient.invalidateQueries({ queryKey: ['fee-invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['fee-summary'] });
      toast.success(mode === 'refund' ? 'Refund recorded' : 'Payment reversed', { description: 'The invoices it covered are open again for what was taken back.' });
      onClose();
    },
    onError: (e) => applyServerError(e, form.setError, ['amountMinor', 'reason'], mode === 'refund' ? "Couldn't refund" : "Couldn't reverse"),
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open={Boolean(mode)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'refund' ? 'Refund payment' : 'Reverse payment'}</DialogTitle>
          <DialogDescription>
            {mode === 'refund'
              ? `Money handed back to the family — up to ${fmt.money(payment.netMinor)}. The receipt stays valid for the rest.`
              : 'For a payment recorded in error — a bounced cheque, the wrong student. The whole receipt is voided and its invoices reopen.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-4">
          {mode === 'refund' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount" error={errors.amountMinor?.message}>
                {({ id }) => <Controller control={form.control} name="amountMinor" render={({ field }) => <MoneyInput id={id} value={field.value} onChange={field.onChange} />} />}
              </Field>
              <Field label="Refunded by">
                {({ id }) => (
                  <NativeSelect id={id} {...form.register('method')}>
                    {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>
          )}
          <Field label="Reason" error={errors.reason?.message} required>
            {({ id, describedBy }) => <Input id={id} autoFocus aria-describedby={describedBy} aria-invalid={!!errors.reason} {...form.register('reason')} />}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant={mode === 'reverse' ? 'destructive' : 'default'} disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : mode === 'refund' ? 'Record refund' : 'Reverse payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <Receipt id={id} />
    </Suspense>
  );
}
