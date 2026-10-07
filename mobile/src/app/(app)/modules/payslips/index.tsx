import { router, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { PagedList } from '@/components/ui/list';
import { Pill } from '@/components/ui/primitives';
import { monthLabel } from '@/components/teaching/payslip-parts';
import { listMyPayslips, type PayslipSummary } from '@/lib/api/teaching';
import { formatMoney } from '@/lib/format';

const statusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Your published payslips, newest month first. */
export default function MyPayslipsScreen() {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'My payslips' }} />
      <PagedList
        queryKey={['my-payslips', 'list']}
        fetchPage={listMyPayslips}
        keyExtractor={(p) => p._id}
        renderItem={(p) => <PayslipCard slip={p} />}
        empty={{ icon: 'payslip', title: 'No payslips yet', description: 'Your payslip appears here once the school publishes that month’s payroll.' }}
      />
    </View>
  );
}

function PayslipCard({ slip }: { slip: PayslipSummary }) {
  const month = monthLabel(slip.month);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${month}, net pay ${formatMoney(slip.netMinor)}`}
      onPress={() => router.push({ pathname: '/modules/payslips/[id]', params: { id: slip._id } })}
      className="active:opacity-90"
    >
      <Card className="flex-row items-center gap-3 p-4">
        <View className="size-10 items-center justify-center rounded-xl bg-primary/10">
          <Icon name="payslip" size={20} color="primary" />
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-semibold text-foreground">{month}</Text>
            <Pill label={statusLabel(slip.status)} tone={slip.status === 'PUBLISHED' ? 'success' : 'neutral'} />
          </View>
          <Text className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            Gross {formatMoney(slip.grossMinor)} · Deductions {formatMoney(slip.totalDeductionsMinor)}
          </Text>
        </View>
        <View className="items-end gap-0.5">
          <Text className="text-xs text-muted-foreground">Net pay</Text>
          <Text className="text-base font-semibold text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
            {formatMoney(slip.netMinor)}
          </Text>
        </View>
        <Icon name="chevronRight" size={16} />
      </Card>
    </Pressable>
  );
}
