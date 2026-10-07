import { Text, View } from 'react-native';

/** "2026-09" → "September 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** A label and an amount on one line; `strong` for totals. Amounts are pre-formatted money. */
export function MoneyLine({ label, amount, hint, strong, tone, last }: { label: string; amount: string; hint?: string; strong?: boolean; tone?: 'danger' | 'success'; last?: boolean }) {
  return (
    <View className={`flex-row items-center justify-between gap-4 px-4 py-3 ${last ? '' : 'border-b border-border'} ${strong ? 'bg-muted/50' : ''}`}>
      <View className="flex-1 gap-0.5">
        <Text className={`text-sm ${strong ? 'font-semibold text-foreground' : 'text-foreground'}`}>{label}</Text>
        {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
      </View>
      <Text
        className={`text-sm ${strong ? 'font-semibold' : 'font-medium'} ${tone === 'danger' ? 'text-destructive' : tone === 'success' ? 'text-success' : 'text-foreground'}`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {amount}
      </Text>
    </View>
  );
}
