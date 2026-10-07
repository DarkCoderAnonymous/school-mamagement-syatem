import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { QueryClient } from '@tanstack/react-query';
import { Pill } from '@/components/ui/primitives';
import { ApiRequestError } from '@/lib/api/http';
import type { FeeInvoice, InvoiceStatus, PaymentMethod } from '@/lib/api/fees';
import { formatDate, formatMoney } from '@/lib/format';

/** Every fee query key starts with 'fees', so one invalidation refreshes them all. */
export const FEES_KEY = 'fees';

/** After money moves: every fee screen plus the home dashboard's collection card. */
export async function invalidateFees(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [FEES_KEY] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ]);
}

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  ONLINE: 'Online',
};

export const METHOD_OPTIONS = (Object.keys(METHOD_LABEL) as PaymentMethod[]).map((value) => ({
  value,
  label: METHOD_LABEL[value],
}));

export const fullName = (p: { firstName: string; lastName: string } | null | undefined) =>
  p ? `${p.firstName} ${p.lastName}`.trim() : '—';

export const errorText = (err: unknown, fallback = 'Check your connection and try again.') =>
  err instanceof ApiRequestError ? err.message : fallback;

/** One key per collect attempt, so a retried request can't charge twice. */
export const newAttemptKey = () =>
  `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Invoice status as words, the web's badge rules: cancelled, then overdue, then the stored status. */
export function invoiceBadge(inv: { status: InvoiceStatus; isOverdue?: boolean }): {
  label: string;
  tone: 'neutral' | 'danger' | 'warning' | 'success' | 'info';
} {
  if (inv.status === 'CANCELLED') return { label: 'Cancelled', tone: 'neutral' };
  if (inv.isOverdue) return { label: 'Overdue', tone: 'danger' };
  if (inv.status === 'PARTIALLY_PAID') return { label: 'Part paid', tone: 'info' };
  if (inv.status === 'PAID') return { label: 'Paid', tone: 'success' };
  return { label: 'Unpaid', tone: 'warning' };
}

export function InvoicePill({
  invoice,
}: {
  invoice: { status: InvoiceStatus; isOverdue?: boolean };
}) {
  const b = invoiceBadge(invoice);
  return <Pill label={b.label} tone={b.tone} />;
}

/** An invoice in a list: number, status, period or student, balance of total. Opens the invoice. */
export function InvoiceRow({
  invoice: inv,
  showStudent,
}: {
  invoice: FeeInvoice;
  showStudent: boolean;
}) {
  const student = fullName(inv.studentId);
  const cancelled = inv.status === 'CANCELLED';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Invoice ${inv.invoiceNumber}, ${student}, ${inv.periodLabel}, total ${formatMoney(inv.totalMinor)}, balance ${formatMoney(inv.balanceMinor)}`}
      onPress={() =>
        router.push({ pathname: '/modules/fees/invoice/[id]', params: { id: inv._id } })
      }
      className="min-h-[72px] gap-2 rounded-2xl border border-border bg-card p-3.5 active:bg-muted"
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs font-medium text-muted-foreground" numberOfLines={1}>
          {inv.invoiceNumber}
        </Text>
        <InvoicePill invoice={inv} />
      </View>
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-medium text-foreground" numberOfLines={1}>
            {showStudent ? student : inv.periodLabel}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {showStudent ? `${inv.periodLabel} · ` : ''}due {formatDate(inv.dueDate)}
          </Text>
        </View>
        <View className="items-end gap-0.5">
          <Text
            className={`text-base font-semibold ${!cancelled && inv.isOverdue ? 'text-destructive' : 'text-foreground'}`}
          >
            {formatMoney(cancelled ? 0 : inv.balanceMinor)}
          </Text>
          <Text className="text-xs text-muted-foreground">of {formatMoney(inv.totalMinor)}</Text>
        </View>
      </View>
    </Pressable>
  );
}
