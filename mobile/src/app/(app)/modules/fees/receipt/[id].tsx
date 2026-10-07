import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Share, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DetailRow, ListRow } from '@/components/ui/list';
import { Banner, Pill, SectionTitle } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/screen';
import { errorText, FEES_KEY, fullName, METHOD_LABEL } from '@/components/fees/fee-ui';
import { MoneyBackSheet, type MoneyBackMode } from '@/components/fees/money-back-sheet';
import { getPayment, type FeePayment } from '@/lib/api/fees';
import { useSession } from '@/lib/auth-context';
import { formatDate, formatMoney } from '@/lib/format';
import { can } from '@/lib/modules';
import { useTheme } from '@/lib/theme';

function receiptState(p: FeePayment): { label: string; tone: 'neutral' | 'warning' | 'success' } {
  if (p.status === 'REVERSED') return { label: 'Reversed', tone: 'neutral' };
  if (p.refundedMinor > 0) return { label: p.netMinor === 0 ? 'Refunded' : 'Part refunded', tone: 'warning' };
  return { label: 'Paid', tone: 'success' };
}

/** The receipt as plain text — what goes into a WhatsApp message or an email. */
function receiptText(p: FeePayment, schoolName: string): string {
  const money = (m: number) => formatMoney(m, p.currency);
  const student = p.studentId;
  const cls = student?.classId ? `${student.classId.name}${student.sectionId ? ` ${student.sectionId.name}` : ''}` : null;
  const lines = [
    p.schoolName ?? schoolName,
    `Fee receipt ${p.receiptNumber}${p.status === 'REVERSED' ? ' — REVERSED' : ''}`,
    '',
    `Date: ${formatDate(p.paidAt, true)}`,
    `Student: ${fullName(student)}${student?.admissionNumber ? ` (${student.admissionNumber})` : ''}`,
    ...(cls ? [`Class: ${cls}`] : []),
    `Paid by: ${METHOD_LABEL[p.method]}${p.reference ? ` · ${p.reference}` : ''}`,
    '',
    'Applied to:',
    ...p.allocations.map((a) => `  ${a.invoiceId?.invoiceNumber ?? '—'} ${a.invoiceId?.periodLabel ?? ''}: ${money(a.amountMinor)}`),
    '',
    `Amount received: ${money(p.amountMinor)}`,
    ...p.refunds.map((r) => `Refunded ${formatDate(r.at)}: −${money(r.amountMinor)}`),
    ...(p.refundedMinor > 0 ? [`Net paid: ${money(p.netMinor)}`] : []),
    ...(p.status === 'REVERSED' ? [`Reversed on ${formatDate(p.reversedAt)}${p.reversalReason ? `: ${p.reversalReason}` : ''}`] : []),
    '',
    `Received by ${fullName(p.receivedByUserId)}. This is a computer-generated receipt.`,
  ];
  return lines.join('\n');
}

/** A receipt: what was paid, how, against which invoices; share it; refund or reverse it. */
export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { user } = useSession();
  const perms = user?.permissions;
  const canRead = can(perms, Permission.FEE_INVOICE_READ);
  const query = useQuery({ queryKey: [FEES_KEY, 'payment', id], queryFn: () => getPayment(id), enabled: canRead });
  const [sheet, setSheet] = useState<MoneyBackMode | null>(null);
  const p = query.data;

  if (!p) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Stack.Screen options={{ title: 'Receipt' }} />
        {!canRead ? (
          <Banner tone="warning" icon="lock" title="Not available">
            Your role can’t view fee receipts.
          </Banner>
        ) : query.isError ? (
          <View className="w-full gap-3">
            <Banner tone="danger" title="Couldn't load this receipt">
              {errorText(query.error)}
            </Banner>
            <Button label="Try again" variant="outline" onPress={() => void query.refetch()} />
          </View>
        ) : (
          <ActivityIndicator color={theme.mutedForeground} />
        )}
      </View>
    );
  }

  const money = (minor: number) => formatMoney(minor, p.currency);
  const reversed = p.status === 'REVERSED';
  const state = receiptState(p);
  const canRefund = !reversed && can(perms, Permission.FEE_PAYMENT_REFUND);
  const cls = p.studentId?.classId ? `${p.studentId.classId.name}${p.studentId.sectionId ? ` · ${p.studentId.sectionId.name}` : ''}` : undefined;

  const share = async () => {
    try {
      await Share.share({ title: `Receipt ${p.receiptNumber}`, message: receiptText(p, user?.schoolName ?? 'School') });
    } catch {
      Alert.alert("Couldn't share", 'Try again in a moment.');
    }
  };

  return (
    <Screen edges={[]} onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ title: p.receiptNumber }} />

      <Card className="gap-3 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-xs font-medium text-muted-foreground">Receipt {p.receiptNumber}</Text>
            <Text className="text-sm text-muted-foreground">{formatDate(p.paidAt, true)}</Text>
          </View>
          <Pill label={state.label} tone={state.tone} />
        </View>
        <View className="gap-0.5">
          <Text className={`text-3xl font-semibold tracking-tight ${reversed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{money(p.amountMinor)}</Text>
          <Text className="text-sm text-muted-foreground">
            {METHOD_LABEL[p.method]} from {fullName(p.studentId)}
            {p.refundedMinor > 0 && !reversed ? ` · net ${money(p.netMinor)}` : ''}
          </Text>
        </View>
        <Button label="Share receipt" icon="send" variant="outline" onPress={share} />
      </Card>

      {reversed && (
        <Banner tone="warning" title="This payment was reversed">
          {`Reversed on ${formatDate(p.reversedAt)} by ${fullName(p.reversedByUserId)}${p.reversalReason ? `: ${p.reversalReason}` : ''}. Its invoices were reopened.`}
        </Banner>
      )}

      <View className="gap-2.5">
        <SectionTitle title="Details" />
        <Card className="overflow-hidden">
          <DetailRow label="Student" value={fullName(p.studentId)} />
          <DetailRow label="Admission no." value={p.studentId?.admissionNumber} />
          <DetailRow label="Class" value={cls} />
          <DetailRow label="Method" value={`${METHOD_LABEL[p.method]}${p.reference ? ` · ${p.reference}` : ''}`} />
          {p.note ? <DetailRow label="Note" value={p.note} /> : null}
          <DetailRow label="Collected by" value={fullName(p.receivedByUserId)} last />
        </Card>
      </View>

      <View className="gap-2.5">
        <SectionTitle title="Applied to" />
        <Card className="overflow-hidden">
          {p.allocations.map((a, i) => (
            <ListRow
              key={`${a.invoiceId?._id ?? 'x'}-${i}`}
              icon="receipt"
              title={a.invoiceId?.periodLabel ?? 'Invoice'}
              subtitle={`${a.invoiceId?.invoiceNumber ?? '—'}${a.refundedMinor > 0 ? ` · ${money(a.refundedMinor)} taken back` : ''}`}
              trailing={<Text className="text-sm font-semibold text-foreground">{money(a.amountMinor)}</Text>}
              onPress={a.invoiceId ? () => router.push({ pathname: '/modules/fees/invoice/[id]', params: { id: a.invoiceId!._id } }) : undefined}
              last={i === p.allocations.length - 1}
            />
          ))}
          <View className="gap-1.5 border-t border-border px-4 py-3">
            <View className="flex-row justify-between">
              <Text className="text-sm font-semibold text-foreground">Amount received</Text>
              <Text className="text-sm font-semibold text-foreground">{money(p.amountMinor)}</Text>
            </View>
            {p.refunds.map((r, i) => (
              <View key={i} className="flex-row justify-between">
                <Text className="text-sm text-muted-foreground">Refunded {formatDate(r.at)}</Text>
                <Text className="text-sm text-foreground">−{money(r.amountMinor)}</Text>
              </View>
            ))}
            {p.refundedMinor > 0 && (
              <View className="flex-row justify-between border-t border-border pt-1.5">
                <Text className="text-sm font-semibold text-foreground">Net paid</Text>
                <Text className="text-sm font-semibold text-foreground">{money(p.netMinor)}</Text>
              </View>
            )}
          </View>
        </Card>
      </View>

      {p.refunds.length > 0 && (
        <View className="gap-2.5">
          <SectionTitle title="Refund history" />
          <Card className="gap-2 p-4">
            {p.refunds.map((r, i) => (
              <Text key={i} className="text-sm text-muted-foreground">
                {formatDate(r.at, true)} · {money(r.amountMinor)} by {METHOD_LABEL[r.method]} — {r.reason} ({fullName(r.byUserId)})
              </Text>
            ))}
          </Card>
        </View>
      )}

      {canRefund && (
        <View className="gap-2.5">
          <SectionTitle title="Corrections" />
          <View className="flex-row gap-2">
            {p.netMinor > 0 && <Button label="Refund" variant="outline" className="flex-1" onPress={() => setSheet('refund')} />}
            <Button label="Reverse" variant="destructive" className="flex-1" onPress={() => setSheet('reverse')} />
          </View>
          <Text className="px-1 text-xs text-muted-foreground">Receipts are never edited. Refund money handed back; reverse a payment recorded in error.</Text>
        </View>
      )}

      <MoneyBackSheet payment={p} mode={sheet} onClose={() => setSheet(null)} />
    </Screen>
  );
}
