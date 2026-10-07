import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Card } from '@/components/ui/card';
import { useDebounced } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { ChoiceChips, PagedList, SearchField, StatTile } from '@/components/ui/list';
import { Banner, Pill, SectionTitle } from '@/components/ui/primitives';
import { HeaderButton } from '@/components/management/header-button';
import { useSession } from '@/lib/auth-context';
import { fullName, getFinanceSummary, listLedgerEntries, monthLabel, PAYMENT_METHOD_LABEL, type LedgerEntry, type LedgerType } from '@/lib/api/management';
import { formatDate, formatMoney } from '@/lib/format';
import { can } from '@/lib/modules';

const SUMMARY_KEY = ['finance', 'summary', 1] as const;
const TYPES: { value: LedgerType; label: string }[] = [
  { value: 'EXPENSE', label: 'Expenses' },
  { value: 'INCOME', label: 'Income' },
];

/**
 * This month's money in and out, and the ledger of expenses and non-fee
 * income. Entries are never edited: a wrong one is voided and stays visible,
 * muted, so the history is honest.
 */
export default function FinanceScreen() {
  const { user } = useSession();
  const canRecord = can(user?.permissions, Permission.FINANCE_RECORD);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<LedgerType>();
  const [open, setOpen] = useState<string>();
  const q = useDebounced(search.trim());

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: 'Expenses & income',
          headerRight: canRecord ? () => <HeaderButton label="Record" accessibilityLabel="Record an expense or income" onPress={() => router.push('/modules/finance/new')} /> : undefined,
        }}
      />
      <PagedList
        queryKey={['finance', 'entries', { search: q, type }]}
        fetchPage={(page) => {
          // Pull-to-refresh refetches page 1 — refresh the month's totals with it (unless they're only seconds old).
          if (page === 1 && Date.now() - (queryClient.getQueryState(SUMMARY_KEY)?.dataUpdatedAt ?? 0) > 5_000) {
            void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
          }
          return listLedgerEntries({ page, limit: 30, search: q || undefined, type, includeVoided: 'true' });
        }}
        keyExtractor={(e) => e._id}
        renderItem={(e) => <EntryCard entry={e} open={open === e._id} onToggle={() => setOpen(open === e._id ? undefined : e._id)} />}
        header={
          <View className="gap-3 pb-2">
            <MonthSummary />
            <SectionTitle title="Ledger" />
            <SearchField value={search} onChangeText={setSearch} placeholder="Search description, payee or reference" />
            <ChoiceChips
              label="Entry type"
              options={[{ value: 'ALL' as const, label: 'All' }, ...TYPES]}
              value={type ?? 'ALL'}
              onChange={(v) => setType(v === 'ALL' ? undefined : v)}
            />
          </View>
        }
        empty={
          q || type
            ? { icon: 'search', title: 'No entries match', description: 'Try a different search or type.' }
            : { icon: 'finance', title: 'Nothing recorded yet', description: 'Bills, repairs and purchases are expenses; donations and rentals are income.' }
        }
      />
    </View>
  );
}

function MonthSummary() {
  const summary = useQuery({ queryKey: SUMMARY_KEY, queryFn: () => getFinanceSummary(1) });
  const m = summary.data?.months[summary.data.months.length - 1];
  if (summary.isError) {
    return (
      <Banner tone="danger" title="Couldn't load this month's totals">
        Pull down to try again.
      </Banner>
    );
  }
  const income = m ? m.feeIncomeMinor + m.otherIncomeMinor : 0;
  return (
    <View className="gap-2.5">
      <SectionTitle title={m ? monthLabel(m.month) : 'This month'} />
      <View className="flex-row gap-2.5">
        <StatTile label="Income" value={m ? formatMoney(income) : '—'} hint={m ? `${formatMoney(m.feeIncomeMinor)} from fees` : undefined} icon="trendUp" />
        <StatTile label="Expenses" value={m ? formatMoney(m.expenseMinor) : '—'} hint="Voided entries excluded" icon="trendDown" />
      </View>
      <StatTile
        label="Net this month"
        value={m ? formatMoney(m.netMinor) : '—'}
        hint="Fee collections plus other income, less expenses"
        icon="finance"
        tone={!m ? 'default' : m.netMinor < 0 ? 'danger' : 'success'}
      />
    </View>
  );
}

function EntryCard({ entry: e, open, onToggle }: { entry: LedgerEntry; open: boolean; onToggle: () => void }) {
  const voided = !!e.voidedAt;
  const income = e.type === 'INCOME';
  const amount = `${income ? '+' : '−'}${formatMoney(e.amountMinor)}`;
  return (
    <Card className={voided ? 'opacity-60' : ''}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${e.description}, ${income ? 'income' : 'expense'} ${formatMoney(e.amountMinor)}, ${formatDate(e.date)}${voided ? ', voided' : ''}`}
        onPress={onToggle}
        className="min-h-[60px] flex-row items-center gap-3 px-4 py-3 active:bg-muted"
      >
        <View className={`size-9 items-center justify-center rounded-lg ${voided ? 'bg-muted' : income ? 'bg-success-soft' : 'bg-warning-soft'}`}>
          <Icon name={income ? 'trendUp' : 'trendDown'} size={18} color={voided ? 'mutedForeground' : income ? 'success' : 'warningInk'} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className={`text-base font-medium text-foreground ${voided ? 'line-through' : ''}`} numberOfLines={1}>
            {e.description}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {formatDate(e.date)} · {e.categoryId?.name ?? 'Archived category'} · {PAYMENT_METHOD_LABEL[e.method]}
          </Text>
        </View>
        <View className="items-end gap-1">
          <Text className={`text-base font-semibold ${voided ? 'text-muted-foreground line-through' : income ? 'text-success' : 'text-foreground'}`}>{amount}</Text>
          {voided ? <Pill label="Voided" tone="neutral" /> : e.source === 'PAYROLL' ? <Pill label="Payroll" tone="info" /> : null}
        </View>
      </Pressable>
      {open && (
        <View className="gap-1.5 border-t border-border px-4 py-3">
          {e.party ? <Line label={income ? 'Received from' : 'Paid to'} value={e.party} /> : null}
          {e.reference ? <Line label="Reference" value={e.reference} /> : null}
          <Line label="Recorded by" value={fullName(e.recordedByUserId)} />
          {voided && (
            <>
              <Line label="Voided" value={`${formatDate(e.voidedAt)} by ${fullName(e.voidedByUserId)}`} />
              {e.voidReason ? <Line label="Reason" value={e.voidReason} /> : null}
            </>
          )}
        </View>
      )}
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right text-sm text-foreground">{value}</Text>
    </View>
  );
}
