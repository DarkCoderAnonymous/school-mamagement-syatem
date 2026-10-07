'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, HandCoins, Printer, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { StudentPicker } from '@/components/data/student-picker';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { MoneyInput } from '@/components/form/money-input';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName, invoiceBadge, PAYMENT_METHOD_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { getStudentDues, recordPayment } from '@/lib/api/finance';
import type { FeePayment, PaymentMethod, Student } from '@/lib/api/types';

function newAttemptKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`;
}

function Collect() {
  const router = useRouter();
  const search = useSearchParams();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const studentId = search.get('studentId');
  const [picked, setPicked] = useState<Student | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState(0);
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [attemptKey, setAttemptKey] = useState(newAttemptKey);
  const [receipt, setReceipt] = useState<FeePayment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dues = useQuery({ queryKey: ['fee-dues', studentId], queryFn: () => getStudentDues(studentId!), enabled: Boolean(studentId) });
  const invoices = useMemo(() => dues.data?.invoices ?? [], [dues.data]);

  // New student or fresh dues: select everything open, oldest first (adjusted during render).
  const [syncedInvoices, setSyncedInvoices] = useState<typeof invoices | null>(null);
  if (syncedInvoices !== invoices) {
    setSyncedInvoices(invoices);
    setSelected(invoices.map((i) => i._id));
    setAmountTouched(false);
  }
  const selectedTotal = invoices.filter((i) => selected.includes(i._id)).reduce((s, i) => s + i.balanceMinor, 0);
  const effectiveAmount = amountTouched ? amount : selectedTotal;

  const choose = (s: Student | null) => {
    setPicked(s);
    setReceipt(null);
    setError(null);
    setAttemptKey(newAttemptKey());
    router.replace(s ? `/app/fees/collect?studentId=${s._id}` : '/app/fees/collect');
  };

  const pay = useMutation({
    mutationFn: () =>
      recordPayment({
        studentId: studentId!,
        amountMinor: effectiveAmount,
        method,
        reference: reference || undefined,
        invoiceIds: invoices.filter((i) => selected.includes(i._id)).map((i) => i._id),
        idempotencyKey: attemptKey,
      }),
    onSuccess: async (payment) => {
      setReceipt(payment);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['fee-dues'] });
      await queryClient.invalidateQueries({ queryKey: ['fee-invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['fee-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['fee-payments'] });
    },
    onError: (e) => setError(errorMessage(e, "Couldn't record the payment")),
  });

  const student = dues.data?.student ?? picked;
  const valid = effectiveAmount > 0 && effectiveAmount <= selectedTotal && selected.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Collect fees"
        description="Find the student, choose what they’re paying, and issue the receipt."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Collect fees' }]}
      />

      <section className="bg-card space-y-2 rounded-xl border p-5">
        <label className="text-[0.8125rem] font-medium">Student</label>
        <StudentPicker value={student ?? null} onChange={choose} autoFocus={!studentId} />
      </section>

      {!studentId && (
        <div className="bg-card rounded-xl border">
          <EmptyState icon={HandCoins} title="Search for a student to see their dues" description="Type a name, admission number or roll number." />
        </div>
      )}

      {studentId && dues.isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
      {studentId && dues.isError && (
        <div className="rounded-xl border">
          <ErrorState error={dues.error} onRetry={() => void dues.refetch()} title="Couldn't load this student’s dues" />
        </div>
      )}

      {receipt && (
        <section className="bg-success-soft border-success/30 animate-fade-up flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="text-success animate-pop mt-0.5 size-6 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {fmt.money(receipt.amountMinor)} received · <span className="font-mono">{receipt.receiptNumber}</span>
              </p>
              <p className="text-muted-foreground text-sm">
                {PAYMENT_METHOD_LABEL[receipt.method]} from {fullName(receipt.studentId)}. Remaining due: {fmt.money(dues.data?.totalDueMinor ?? 0)}.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/app/fees/payments/${receipt._id}?print=1`} className={buttonVariants()}>
              <Printer className="size-4" />
              Print receipt
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                setReceipt(null);
                setAttemptKey(newAttemptKey());
                setReference('');
              }}
            >
              <RotateCcw className="size-4" />
              New payment
            </Button>
          </div>
        </section>
      )}

      {dues.data && !receipt && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <section className="bg-card space-y-4 rounded-xl border p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">Open dues</h2>
              <p className="text-sm tabular-nums">
                {fmt.money(dues.data.totalDueMinor)} due
                {dues.data.overdueMinor > 0 && <span className="text-destructive"> · {fmt.money(dues.data.overdueMinor)} overdue</span>}
              </p>
            </div>
            {invoices.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Nothing owed — this student is fully paid up.</p>
            ) : (
              <ul className="rows-stagger divide-y overflow-hidden rounded-lg border">
                {invoices.map((inv) => {
                  const on = selected.includes(inv._id);
                  const b = invoiceBadge(inv);
                  return (
                    <li key={inv._id}>
                      <label className={cn('flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors', on ? 'bg-primary/5' : 'hover:bg-muted/50')}>
                        <input
                          type="checkbox"
                          className="accent-primary size-4"
                          checked={on}
                          onChange={() => setSelected(on ? selected.filter((x) => x !== inv._id) : [...selected, inv._id])}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{inv.periodLabel}</p>
                          <p className="text-muted-foreground text-xs">
                            <span className="font-mono">{inv.invoiceNumber}</span> · due {fmt.date(inv.dueDate)}
                          </p>
                        </div>
                        <StatusBadge status={b.status} label={b.label} />
                        <span className="w-24 text-right text-sm font-medium tabular-nums">{fmt.money(inv.balanceMinor)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {dues.data.concessions.length > 0 && (
              <p className="text-muted-foreground text-xs">
                Standing concessions: {dues.data.concessions.map((c) => `${c.name} (${c.type === 'PERCENT' ? `${c.value}%` : fmt.money(c.value)})`).join(', ')}
              </p>
            )}
          </section>

          <form
            className="bg-card h-fit space-y-4 rounded-xl border p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) pay.mutate();
            }}
          >
            <h2 className="font-semibold">Payment</h2>
            <Field label="Amount received" help={`Selected invoices: ${fmt.money(selectedTotal)}. A smaller amount is a part payment.`}>
              {({ id, describedBy }) => (
                <MoneyInput
                  id={id}
                  aria-describedby={describedBy}
                  value={effectiveAmount}
                  onChange={(v) => {
                    setAmount(v);
                    setAmountTouched(true);
                  }}
                />
              )}
            </Field>
            <Field label="Method">
              {({ id }) => (
                <NativeSelect id={id} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            {method !== 'CASH' && (
              <Field label="Reference" help="Cheque, transfer or card slip number.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={reference} onChange={(e) => setReference(e.target.value)} />}
              </Field>
            )}
            {effectiveAmount > selectedTotal && <p className="text-destructive text-xs">That’s more than the selected invoices come to.</p>}
            {error && <p role="alert" className="bg-destructive-soft text-destructive animate-shake rounded-lg px-3 py-2 text-sm">{error}</p>}
            <Button type="submit" className="h-11 w-full" disabled={!valid || pay.isPending}>
              {pay.isPending ? 'Recording…' : `Receive ${fmt.money(effectiveAmount)}`}
            </Button>
          </form>
        </div>
      )}

      {dues.data && dues.data.recentPayments.length > 0 && !receipt && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Recent payments</h2>
          <ul className="bg-card divide-y rounded-xl border text-sm">
            {dues.data.recentPayments.map((p) => (
              <li key={p._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link href={`/app/fees/payments/${p._id}`} className="hover:text-primary font-mono text-xs">
                  {p.receiptNumber}
                </Link>
                <span className="text-muted-foreground text-xs">{fmt.date(p.paidAt)} · {PAYMENT_METHOD_LABEL[p.method]}</span>
                <span className="tabular-nums">{p.status === 'REVERSED' ? <StatusBadge status="CANCELLED" label="Reversed" /> : fmt.money(p.netMinor)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function CollectFeesPage() {
  return (
    <Suspense fallback={null}>
      <Collect />
    </Suspense>
  );
}
