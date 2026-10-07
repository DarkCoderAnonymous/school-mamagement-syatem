import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DetailRow } from '@/components/ui/list';
import { Banner, Pill, SectionTitle } from '@/components/ui/primitives';
import { MoneyLine, monthLabel } from '@/components/teaching/payslip-parts';
import { ApiRequestError } from '@/lib/api/http';
import { getMyPayslip, getStaffPayslip } from '@/lib/api/teaching';
import { formatMoney } from '@/lib/format';
import { useTheme } from '@/lib/theme';

/** Only the last four digits of an account number leave the payslip on a phone screen. */
const masked = (n?: string) => (n ? (n.length > 4 ? `•••• ${n.slice(-4)}` : n) : undefined);

/**
 * One payslip, exactly as issued: every name and amount is the snapshot taken
 * when payroll ran, so a later change to a salary never rewrites it. Opened
 * with `staff=1` from someone's staff profile, it's the payroll office's read
 * of anyone's payslip (drafts included); otherwise it's your own.
 */
export default function PayslipScreen() {
  const { id, staff } = useLocalSearchParams<{ id: string; staff?: string }>();
  const theme = useTheme();
  const office = staff === '1';
  const q = useQuery({
    queryKey: [office ? 'staff-payslips' : 'my-payslips', id],
    queryFn: () => (office ? getStaffPayslip(id) : getMyPayslip(id)),
  });
  const slip = q.data;

  if (!slip) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Stack.Screen options={{ title: 'Payslip' }} />
        {q.isError ? (
          <View className="w-full gap-3 px-4">
            <Banner tone="danger" title="Couldn't load this payslip">
              {q.error instanceof ApiRequestError ? q.error.message : 'Check your connection and try again.'}
            </Banner>
            <Button label="Try again" variant="outline" onPress={() => q.refetch()} />
          </View>
        ) : (
          <ActivityIndicator color={theme.mutedForeground} />
        )}
      </View>
    );
  }

  const money = (minor: number) => formatMoney(minor, slip.currency);
  const month = monthLabel(slip.month);
  const earnings = [{ name: 'Basic pay', amountMinor: slip.basicMinor }, ...slip.earnings];
  const deductions: { name: string; hint?: string; amountMinor: number }[] = [
    ...slip.deductions,
    ...(slip.unpaidLeaveDays > 0 || slip.unpaidLeaveDeductionMinor > 0
      ? [{ name: 'Unpaid leave', hint: `${slip.unpaidLeaveDays} of ${slip.daysInMonth} days`, amountMinor: slip.unpaidLeaveDeductionMinor }]
      : []),
    ...slip.advanceRecoveries.map((a, i) => ({
      name: 'Advance recovery',
      hint: slip.advanceRecoveries.length > 1 ? `Instalment ${i + 1} of ${slip.advanceRecoveries.length} this month` : undefined,
      amountMinor: a.amountMinor,
    })),
  ];
  const signed = (minor: number) => (minor < 0 ? `−${money(-minor)}` : `+${money(minor)}`);

  return (
    <Screen edges={[]} onRefresh={() => q.refetch()}>
      <Stack.Screen options={{ title: month }} />

      <Card className="items-center gap-1 p-5">
        <Text className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{slip.schoolName ?? 'Payslip'}</Text>
        <Text className="text-sm text-muted-foreground">Net pay for {month}</Text>
        <Text className="pt-1 text-3xl font-semibold tracking-tight text-foreground" style={{ fontVariant: ['tabular-nums'] }} adjustsFontSizeToFit numberOfLines={1}>
          {money(slip.netMinor)}
        </Text>
        <Text className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
          Gross {money(slip.grossMinor)} − deductions {money(slip.totalDeductionsMinor)}
          {slip.adjustments.length ? ' ± adjustments' : ''}
        </Text>
        {office && slip.status !== 'PUBLISHED' && (
          <View className="pt-2">
            <Pill label={slip.status === 'DRAFT' ? 'Draft — can still change' : 'Locked — not yet published to them'} tone={slip.status === 'DRAFT' ? 'neutral' : 'info'} />
          </View>
        )}
      </Card>

      <View className="gap-2.5">
        <SectionTitle title="Earnings" />
        <Card className="overflow-hidden">
          {earnings.map((e, i) => (
            <MoneyLine key={`${e.name}-${i}`} label={e.name} amount={money(e.amountMinor)} />
          ))}
          <MoneyLine label="Gross pay" amount={money(slip.grossMinor)} strong last />
        </Card>
      </View>

      <View className="gap-2.5">
        <SectionTitle title="Deductions" />
        <Card className="overflow-hidden">
          {deductions.length === 0 && <Text className="border-b border-border px-4 py-3 text-sm text-muted-foreground">No deductions this month</Text>}
          {deductions.map((d, i) => (
            <MoneyLine key={`${d.name}-${i}`} label={d.name} hint={d.hint} amount={money(d.amountMinor)} />
          ))}
          <MoneyLine label="Total deductions" amount={money(slip.totalDeductionsMinor)} strong last />
        </Card>
      </View>

      {slip.adjustments.length > 0 && (
        <View className="gap-2.5">
          <SectionTitle title="Adjustments" />
          <Card className="overflow-hidden">
            {slip.adjustments.map((a, i) => (
              <MoneyLine key={`${a.label}-${i}`} label={a.label} amount={signed(a.amountMinor)} tone={a.amountMinor < 0 ? 'danger' : 'success'} last={i === slip.adjustments.length - 1} />
            ))}
          </Card>
        </View>
      )}

      <Card className="overflow-hidden">
        <MoneyLine label="Net pay" amount={money(slip.netMinor)} strong last />
      </Card>

      <View className="gap-2.5">
        <SectionTitle title="Details" />
        <Card className="overflow-hidden">
          <DetailRow label="Employee" value={slip.employee.name} />
          <DetailRow label="Employee no." value={slip.employee.employeeNumber} />
          <DetailRow label="Designation" value={[slip.employee.designation, slip.employee.department].filter(Boolean).join(' · ')} />
          <DetailRow label="Pay period" value={month} />
          <DetailRow label="Bank" value={slip.bank?.bankName} />
          <DetailRow label="Account" value={masked(slip.bank?.accountNumber)} last />
        </Card>
      </View>
    </Screen>
  );
}
