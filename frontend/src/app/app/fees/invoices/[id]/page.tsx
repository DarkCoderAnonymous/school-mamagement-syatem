'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, Printer, SlidersHorizontal, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/auth/permission-gate';
import { PrintLayout } from '@/components/print/print-layout';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuthStore } from '@/lib/auth-store';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName, invoiceBadge, PAYMENT_METHOD_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { cancelInvoice, getInvoice } from '@/lib/api/finance';
import { AdjustInvoiceDialog } from '../../invoice-dialogs';
import { StudentLink } from '@/components/students/student-quick-view';

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const fmt = useSchoolFormat();
  const schoolName = useAuthStore((s) => s.user?.schoolName) ?? 'School';
  const queryClient = useQueryClient();
  const [adjusting, setAdjusting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const query = useQuery({ queryKey: ['fee-invoices', id], queryFn: () => getInvoice(id) });

  const cancel = useMutation({
    mutationFn: () => cancelInvoice(id, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fee-invoices'] });
      toast.success('Invoice cancelled');
      setCancelling(false);
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't cancel the invoice")),
  });

  if (query.isLoading) return <Skeleton className="mx-auto h-96 max-w-4xl rounded-xl" />;
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load this invoice" />
      </div>
    );
  }

  const inv = query.data;
  const badge = invoiceBadge(inv);
  const open = inv.status !== 'CANCELLED' && inv.balanceMinor > 0;
  const primary = inv.studentId?.guardians?.find((g) => g.isPrimary)?.guardianId;
  const rows: [string, number, boolean?][] = [
    ['Subtotal', inv.subtotalMinor],
    ...inv.concessions.map((c) => [`Less ${c.name}`, -c.amountMinor] as [string, number]),
    ...(inv.discountMinor ? [['Less discount', -inv.discountMinor] as [string, number]] : []),
    ...(inv.fineMinor ? [['Fine', inv.fineMinor] as [string, number]] : []),
    ...(inv.lateFineMinor ? [['Late fine', inv.lateFineMinor] as [string, number]] : []),
    ['Total', inv.totalMinor, true],
    ['Paid', -inv.paidMinor],
    ['Balance due', inv.balanceMinor, true],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="print:hidden">
        <PageHeader
          title={inv.invoiceNumber}
          description={`${fullName(inv.studentId)} · ${inv.periodLabel}`}
          breadcrumbs={[
            { label: 'Dashboard', href: '/app' },
            { label: 'Invoices', href: '/app/fees' },
            { label: inv.invoiceNumber },
          ]}
          meta={<div className="pt-1"><StatusBadge status={badge.status} label={badge.label} /></div>}
          action={
            <>
              <Button variant="ghost" onClick={() => window.print()}>
                <Printer className="size-4" />
                Print
              </Button>
              {inv.status !== 'CANCELLED' && (
                <PermissionGate permission={Permission.FEE_INVOICE_ADJUST}>
                  <Button variant="outline" onClick={() => setAdjusting(true)}>
                    <SlidersHorizontal className="size-4" />
                    Adjust
                  </Button>
                  {inv.paidMinor === 0 && (
                    <Button variant="ghost" onClick={() => setCancelling(true)}>
                      <XCircle className="size-4" />
                      Cancel
                    </Button>
                  )}
                </PermissionGate>
              )}
              {open && inv.studentId && (
                <PermissionGate permission={Permission.FEE_PAYMENT_RECORD}>
                  <Link href={`/app/fees/collect?studentId=${inv.studentId._id}`} className={buttonVariants()}>
                    <HandCoins className="size-4" />
                    Collect payment
                  </Link>
                </PermissionGate>
              )}
            </>
          }
        />
      </div>

      {inv.cancelledAt && (
        <p className="bg-muted rounded-lg px-4 py-3 text-sm print:hidden">
          Cancelled on {fmt.date(inv.cancelledAt)}{inv.cancelReason ? ` — ${inv.cancelReason}` : ''}.
        </p>
      )}

      <PrintLayout
        title="Fee invoice"
        schoolName={schoolName}
        meta={[
          { label: 'Invoice no.', value: <span className="font-mono">{inv.invoiceNumber}</span> },
          {
            label: 'Student',
            value: (
              <StudentLink studentId={inv.studentId?._id} tab="fees">
                {fullName(inv.studentId)}
              </StudentLink>
            ),
          },
          { label: 'Admission no.', value: <span className="font-mono">{inv.studentId?.admissionNumber}</span> },
          { label: 'Class', value: `${inv.classId?.name ?? '—'}${inv.sectionId ? ` · ${inv.sectionId.name}` : ''}` },
          { label: 'Issued', value: fmt.date(inv.issueDate) },
          { label: 'Due', value: fmt.date(inv.dueDate) },
        ]}
        footer={primary ? `Parent/guardian: ${fullName(primary)} · ${primary.phone}` : undefined}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs print:text-black">
              <th className="py-2 font-medium">{inv.periodLabel}</th>
              <th className="py-2 text-right font-medium">Amount</th>
              <th className="py-2 text-right font-medium">Concession</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2">{l.name}</td>
                <td className="py-2 text-right tabular-nums">{fmt.money(l.amountMinor)}</td>
                <td className="text-muted-foreground py-2 text-right tabular-nums print:text-black">{l.concessionMinor ? `−${fmt.money(l.concessionMinor)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
          {rows.map(([label, amount, strong]) => (
            <div key={label} className={cn('flex justify-between gap-4', strong && 'border-t pt-1.5 font-semibold')}>
              <dt>{label}</dt>
              <dd className="tabular-nums">{amount < 0 ? `−${fmt.money(-amount)}` : fmt.money(amount)}</dd>
            </div>
          ))}
        </dl>
      </PrintLayout>

      <section className="bg-card space-y-3 rounded-xl border p-5 print:hidden">
        <h2 className="font-semibold">Payments</h2>
        {inv.payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing paid yet.</p>
        ) : (
          <ul className="rows-stagger divide-y overflow-hidden rounded-lg border text-sm">
            {inv.payments.map((p) => (
              <li key={p._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link href={`/app/fees/payments/${p._id}`} className="hover:text-primary font-mono text-xs">
                  {p.receiptNumber}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {fmt.date(p.paidAt)} · {PAYMENT_METHOD_LABEL[p.method]}
                </span>
                <span className="flex items-center gap-2 tabular-nums">
                  {p.status === 'REVERSED' && <StatusBadge status="CANCELLED" label="Reversed" />}
                  {fmt.money(p.appliedMinor - p.refundedMinor)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {inv.adjustments.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <h3 className="text-sm font-medium">Adjustments</h3>
            {inv.adjustments.map((a, i) => (
              <p key={i} className="text-muted-foreground text-xs">
                {fmt.date(a.at)} · {a.type === 'DISCOUNT' ? 'Discount' : 'Fine'} {fmt.money(a.amountMinor)} — {a.reason} ({fullName(a.byUserId)})
              </p>
            ))}
          </div>
        )}
      </section>

      <AdjustInvoiceDialog invoice={inv} open={adjusting} onOpenChange={setAdjusting} />
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={`Cancel ${inv.invoiceNumber}?`}
        description="The family no longer owes it. A new invoice can then be issued for the same period."
        confirmLabel="Cancel invoice"
        destructive
        pending={cancel.isPending}
        onConfirm={() => {
          if (reason.trim().length >= 3) cancel.mutate();
          else toast.error('Give a reason (3+ characters)');
        }}
      >
        <Input aria-label="Reason" placeholder="Reason, e.g. billed the wrong class" value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}
