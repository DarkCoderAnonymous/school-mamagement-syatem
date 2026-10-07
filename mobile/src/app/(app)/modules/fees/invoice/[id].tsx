import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DetailRow, ListRow } from '@/components/ui/list';
import { Banner, Pill, SectionTitle } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/screen';
import { errorText, FEES_KEY, fullName, InvoicePill, METHOD_LABEL } from '@/components/fees/fee-ui';
import { getInvoice } from '@/lib/api/fees';
import { useSession } from '@/lib/auth-context';
import { formatDate, formatMoney } from '@/lib/format';
import { can } from '@/lib/modules';
import { useTheme } from '@/lib/theme';

/**
 * One invoice as issued: the snapshotted lines and concessions, adjustments,
 * what's been paid (each receipt opens) and the balance. Collect from here.
 */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { user } = useSession();
  const perms = user?.permissions;
  const query = useQuery({ queryKey: [FEES_KEY, 'invoice', id], queryFn: () => getInvoice(id), enabled: can(perms, Permission.FEE_INVOICE_READ) });
  const inv = query.data;

  if (!inv) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <Stack.Screen options={{ title: 'Invoice' }} />
        {!can(perms, Permission.FEE_INVOICE_READ) ? (
          <Banner tone="warning" icon="lock" title="Not available">
            Your role can’t view fee invoices.
          </Banner>
        ) : query.isError ? (
          <View className="w-full gap-3">
            <Banner tone="danger" title="Couldn't load this invoice">
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

  const money = (minor: number) => formatMoney(minor, inv.currency);
  const cancelled = inv.status === 'CANCELLED';
  const open = !cancelled && inv.balanceMinor > 0;
  const canCollect = open && !!inv.studentId && can(perms, Permission.FEE_PAYMENT_RECORD);
  const primary = inv.studentId?.guardians?.find((g) => g.isPrimary)?.guardianId ?? inv.studentId?.guardians?.[0]?.guardianId ?? null;

  const totals: { label: string; minor: number; strong?: boolean; danger?: boolean }[] = [
    { label: 'Subtotal', minor: inv.subtotalMinor },
    ...inv.concessions.map((c) => ({ label: `Less ${c.name}`, minor: -c.amountMinor })),
    ...(inv.discountMinor ? [{ label: 'Less discount', minor: -inv.discountMinor }] : []),
    ...(inv.fineMinor ? [{ label: 'Fine', minor: inv.fineMinor }] : []),
    ...(inv.lateFineMinor ? [{ label: 'Late fine', minor: inv.lateFineMinor }] : []),
    { label: 'Total', minor: inv.totalMinor, strong: true },
    { label: 'Paid', minor: -inv.paidMinor },
    { label: 'Balance due', minor: inv.balanceMinor, strong: true, danger: open && inv.isOverdue },
  ];
  const signed = (m: number) => (m < 0 ? `−${money(-m)}` : money(m));

  return (
    <Screen
      edges={canCollect ? ['bottom'] : []}
      onRefresh={() => query.refetch()}
      footer={
        canCollect ? (
          <View className="border-t border-border bg-card px-4 pb-2 pt-3">
            <Button
              label={`Collect payment · ${money(inv.balanceMinor)}`}
              icon="fees"
              onPress={() => router.push({ pathname: '/modules/fees/collect', params: { invoiceId: inv._id, studentId: inv.studentId?._id } })}
            />
          </View>
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: inv.invoiceNumber }} />

      <Card className="gap-3 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-xs font-medium text-muted-foreground">{inv.invoiceNumber}</Text>
            <Text className="text-lg font-semibold text-foreground">{inv.periodLabel}</Text>
          </View>
          <InvoicePill invoice={inv} />
        </View>
        <View className="gap-0.5">
          <Text className="text-xs text-muted-foreground">Balance due</Text>
          <Text className={`text-3xl font-semibold tracking-tight ${open && inv.isOverdue ? 'text-destructive' : 'text-foreground'}`}>
            {money(cancelled ? 0 : inv.balanceMinor)}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {money(inv.paidMinor)} paid of {money(inv.totalMinor)} · due {formatDate(inv.dueDate)}
          </Text>
        </View>
      </Card>

      {cancelled && (
        <Banner tone="info" title="Cancelled">
          {`Cancelled on ${formatDate(inv.cancelledAt)}${inv.cancelReason ? ` — ${inv.cancelReason}` : ''}. Nothing is owed on it.`}
        </Banner>
      )}

      <View className="gap-2.5">
        <SectionTitle title="Billed to" />
        <Card className="overflow-hidden">
          <DetailRow
            label="Student"
            value={fullName(inv.studentId)}
            icon={inv.studentId && can(perms, Permission.STUDENT_READ) ? 'chevronRight' : undefined}
            onPress={
              inv.studentId && can(perms, Permission.STUDENT_READ)
                ? () => router.push({ pathname: '/modules/students/[id]', params: { id: inv.studentId!._id } })
                : undefined
            }
          />
          <DetailRow label="Admission no." value={inv.studentId?.admissionNumber} />
          <DetailRow label="Class" value={inv.classId ? `${inv.classId.name}${inv.sectionId ? ` · ${inv.sectionId.name}` : ''}` : undefined} />
          <DetailRow label="Issued" value={formatDate(inv.issueDate)} />
          <DetailRow label="Due" value={formatDate(inv.dueDate)} last={!primary} />
          {primary && <DetailRow label="Guardian" value={`${fullName(primary)}${primary.phone ? ` · ${primary.phone}` : ''}`} last />}
        </Card>
      </View>

      <View className="gap-2.5">
        <SectionTitle title="Fees" />
        <Card className="overflow-hidden">
          {inv.lines.map((l, i) => (
            <View key={`${l.name}-${i}`} className="flex-row items-center justify-between gap-4 border-b border-border px-4 py-3">
              <Text className="flex-1 text-sm text-foreground">{l.name}</Text>
              <View className="items-end">
                <Text className="text-sm font-medium text-foreground">{money(l.amountMinor)}</Text>
                {l.concessionMinor > 0 && <Text className="text-xs text-success">−{money(l.concessionMinor)} concession</Text>}
              </View>
            </View>
          ))}
          <View className="gap-1.5 px-4 py-3">
            {totals.map((t) => (
              <View key={t.label} className={`flex-row justify-between gap-4 ${t.strong ? 'border-t border-border pt-1.5' : ''}`}>
                <Text className={`text-sm ${t.strong ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{t.label}</Text>
                <Text className={`text-sm ${t.strong ? 'font-semibold' : ''} ${t.danger ? 'text-destructive' : 'text-foreground'}`}>{signed(t.minor)}</Text>
              </View>
            ))}
          </View>
        </Card>
      </View>

      <View className="gap-2.5">
        <SectionTitle title="Payments" />
        <Card className="overflow-hidden">
          {inv.payments.length === 0 ? (
            <Text className="px-4 py-4 text-sm text-muted-foreground">Nothing paid yet.</Text>
          ) : (
            inv.payments.map((p, i) => (
              <ListRow
                key={p._id}
                icon="receipt"
                title={p.receiptNumber}
                subtitle={`${formatDate(p.paidAt)} · ${METHOD_LABEL[p.method]}${p.refundedMinor > 0 ? ` · ${money(p.refundedMinor)} refunded` : ''}`}
                accessibilityLabel={`Receipt ${p.receiptNumber}, ${money(p.appliedMinor - p.refundedMinor)}${p.status === 'REVERSED' ? ', reversed' : ''}`}
                trailing={
                  <View className="items-end gap-1">
                    <Text className={`text-sm font-semibold ${p.status === 'REVERSED' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                      {money(p.appliedMinor - p.refundedMinor)}
                    </Text>
                    {p.status === 'REVERSED' && <Pill label="Reversed" tone="neutral" />}
                  </View>
                }
                onPress={() => router.push({ pathname: '/modules/fees/receipt/[id]', params: { id: p._id } })}
                last={i === inv.payments.length - 1}
              />
            ))
          )}
        </Card>
      </View>

      {inv.adjustments.length > 0 && (
        <View className="gap-2.5">
          <SectionTitle title="Adjustments" />
          <Card className="gap-2 p-4">
            {inv.adjustments.map((a, i) => (
              <View key={i} className="gap-0.5">
                <Text className="text-sm font-medium text-foreground">
                  {a.type === 'DISCOUNT' ? 'Discount' : 'Fine'} {a.type === 'DISCOUNT' ? '−' : '+'}
                  {money(a.amountMinor)}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {formatDate(a.at)} · {a.reason} ({fullName(a.byUserId)})
                </Text>
              </View>
            ))}
          </Card>
        </View>
      )}
    </Screen>
  );
}
