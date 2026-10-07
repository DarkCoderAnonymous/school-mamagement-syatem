import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { ChoiceChips, ListRow, StatTile } from '@/components/ui/list';
import { Banner, EmptyState, Pill, SectionTitle } from '@/components/ui/primitives';
import { MoneyLine, monthLabel } from '@/components/teaching/payslip-parts';
import { getStaffPay, type PayrollStatus } from '@/lib/api/front-office';
import { ApiRequestError } from '@/lib/api/http';
import { formatDate, formatMoney } from '@/lib/format';
import { useTheme } from '@/lib/theme';

const SLIP_STATUS: Record<PayrollStatus, { label: string; tone: 'neutral' | 'info' | 'success' }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  LOCKED: { label: 'Locked', tone: 'info' },
  PUBLISHED: { label: 'Published', tone: 'success' },
};
const STATUS_OPTIONS = (Object.keys(SLIP_STATUS) as PayrollStatus[]).map((s) => ({ value: s, label: SLIP_STATUS[s].label }));

/** Only the last four digits of an account number leave the office on a phone screen. */
const masked = (n?: string | null) => (n ? (n.length > 4 ? `•••• ${n.slice(-4)}` : n) : null);

/**
 * A staff member's pay, for the payroll office: what their salary comes to in
 * a full month, open advances, and a year of payslips (filter by year and
 * status; tap one for the issued payslip). Salary is set on the web.
 */
export function StaffSalary({ employeeId }: { employeeId: string }) {
  const theme = useTheme();
  // Undefined = the latest year they have payslips in.
  const [year, setYear] = useState<number>();
  const [status, setStatus] = useState<PayrollStatus>();
  const q = useQuery({
    queryKey: ['staff-pay', employeeId, year ?? 'latest'],
    queryFn: () => getStaffPay(employeeId, year),
    placeholderData: keepPreviousData,
  });
  const data = q.data;

  if (!data) {
    return q.isError ? (
      <Banner tone="danger" title="Couldn't load salary">
        {q.error instanceof ApiRequestError ? q.error.message : 'Pull down to try again.'}
      </Banner>
    ) : (
      <ActivityIndicator className="py-10" color={theme.mutedForeground} />
    );
  }

  const money = (minor: number) => formatMoney(minor, data.currency);
  const m = data.monthly;
  const outstanding = data.advances.reduce((sum, a) => sum + a.outstandingMinor, 0);
  const slips = status ? data.payslips.filter((p) => p.status === status) : data.payslips;
  const yt = data.yearTotals;

  return (
    <View className="gap-5">
      <View className="gap-3">
        <View className="flex-row gap-3">
          <StatTile label="Monthly gross" value={m ? money(m.grossMinor) : '—'} hint={m ? 'Basic + allowances' : 'No salary set'} />
          <StatTile label="Take-home" value={m ? money(m.netMinor) : '—'} hint={m ? `After ${money(m.totalDeductionsMinor)}` : undefined} />
        </View>
        <View className="flex-row gap-3">
          <StatTile label={`Paid in ${data.year}`} value={money(yt.netMinor)} hint={`${yt.payslips} payslip${yt.payslips === 1 ? '' : 's'} issued`} />
          <StatTile
            label="Advances owed"
            value={money(outstanding)}
            tone={outstanding > 0 ? 'danger' : 'default'}
            hint={data.advances.length ? `${data.advances.length} open` : 'None open'}
          />
        </View>
      </View>

      <View className="gap-2.5">
        <SectionTitle title="Payslips" action={q.isFetching ? <ActivityIndicator size="small" color={theme.mutedForeground} /> : undefined} />
        <ChoiceChips
          label="Year"
          options={data.years.map((y) => ({ value: String(y), label: String(y) }))}
          value={String(data.year)}
          onChange={(v) => v && setYear(Number(v))}
        />
        <ChoiceChips label="Payslip status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        {slips.length === 0 ? (
          <Card>
            <EmptyState
              icon="payslip"
              title={status ? `No ${SLIP_STATUS[status].label.toLowerCase()} payslips in ${data.year}` : `No payslips in ${data.year}`}
              description={status ? 'Try another status or year.' : 'Payslips appear once a payroll run includes them.'}
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {slips.map((p, i) => (
              <ListRow
                key={p._id}
                icon="payslip"
                title={monthLabel(p.month)}
                subtitle={`Net ${money(p.netMinor)} · gross ${money(p.grossMinor)}${p.unpaidLeaveDays ? ` · ${p.unpaidLeaveDays} unpaid` : ''}`}
                trailing={<Pill label={SLIP_STATUS[p.status].label} tone={SLIP_STATUS[p.status].tone} />}
                last={i === slips.length - 1}
                onPress={() => router.push({ pathname: '/modules/payslips/[id]', params: { id: p._id, staff: '1' } })}
              />
            ))}
          </Card>
        )}
      </View>

      <View className="gap-2.5">
        <SectionTitle title="Salary structure" />
        {!m || !data.structure ? (
          <Card className="p-4">
            <Text className="text-sm text-muted-foreground">No salary is set for them yet, so payroll runs leave them out. Salaries are set on the web, under Payroll.</Text>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <MoneyLine label="Basic pay" amount={money(m.basicMinor)} />
            {m.earnings.map((e) => (
              <MoneyLine key={`e-${e.code ?? ''}${e.name}`} label={e.name} amount={money(e.amountMinor)} />
            ))}
            <MoneyLine label="Gross pay" amount={money(m.grossMinor)} strong />
            {m.deductions.map((d) => (
              <MoneyLine key={`d-${d.code ?? ''}${d.name}`} label={d.name} amount={`−${money(d.amountMinor)}`} tone="danger" />
            ))}
            <MoneyLine
              label="Take-home"
              hint={`A full month, no unpaid days · since ${formatDate(data.structure.effectiveFrom)}`}
              amount={money(m.netMinor)}
              strong
              last={!data.structure.bankName && !data.structure.accountNumber}
            />
            {(data.structure.bankName || data.structure.accountNumber) && (
              <MoneyLine label={data.structure.bankName ?? 'Bank account'} hint={data.structure.accountTitle ?? undefined} amount={masked(data.structure.accountNumber) ?? ''} last />
            )}
          </Card>
        )}
      </View>

      {data.advances.length > 0 && (
        <View className="gap-2.5">
          <SectionTitle title="Open advances" />
          <Card className="overflow-hidden">
            {data.advances.map((a, i) => (
              <MoneyLine
                key={a._id}
                label={`${money(a.outstandingMinor)} left`}
                hint={`${money(a.amountMinor)} on ${formatDate(a.issuedAt)} · ${money(a.installmentMinor)}/month${a.reason ? ` · ${a.reason}` : ''}`}
                amount={`${money(a.recoveredMinor)} back`}
                last={i === data.advances.length - 1}
              />
            ))}
          </Card>
        </View>
      )}
    </View>
  );
}
