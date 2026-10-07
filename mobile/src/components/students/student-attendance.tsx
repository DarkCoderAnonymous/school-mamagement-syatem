import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Banner, EmptyState, Meter, Pill, SectionTitle } from '@/components/ui/primitives';
import { getStudentAttendance, type StudentAttendance as MonthData } from '@/lib/api/attendance';
import { ApiRequestError } from '@/lib/api/http';
import type { AttendanceStatus } from '@/lib/api/types';
import { STATUS_META, STATUSES } from '@/lib/attendance-status';
import { longDay } from '@/lib/dates';
import { useTheme } from '@/lib/theme';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TONE: Record<AttendanceStatus, 'success' | 'danger' | 'warning' | 'info'> = {
  PRESENT: 'success',
  ABSENT: 'danger',
  LATE: 'warning',
  LEAVE: 'info',
};

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const monthTitle = (month: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/**
 * A student's attendance a month at a time: their % and counts, the month as
 * a calendar, and the days they weren't simply present. Tap a count to list
 * just those days.
 */
export function StudentAttendance({ studentId }: { studentId: string }) {
  const theme = useTheme();
  // Undefined = the school's current month (the server knows the school's today).
  const [month, setMonth] = useState<string>();
  const [filter, setFilter] = useState<AttendanceStatus>();
  const q = useQuery({
    queryKey: ['student-attendance', studentId, month ?? 'current'],
    queryFn: () => getStudentAttendance(studentId, month),
    placeholderData: keepPreviousData,
  });
  const data = q.data;

  if (!data) {
    return q.isError ? (
      <Banner tone="danger" title="Couldn't load attendance">
        {q.error instanceof ApiRequestError ? q.error.message : 'Pull down to try again.'}
      </Banner>
    ) : (
      <ActivityIndicator className="py-10" color={theme.mutedForeground} />
    );
  }

  const atCurrentMonth = data.month >= data.today.slice(0, 7);
  const { monthTotals: mt, sessionTotals: st } = data;
  const pct = mt.percentage;
  const listed = data.days.filter((d) =>
    filter ? d.status === filter : d.status && d.status !== 'PRESENT',
  );

  return (
    <View className="gap-5">
      <View className="flex-row items-center justify-between">
        <MonthButton
          icon="chevronLeft"
          label="Previous month"
          onPress={() => setMonth(shiftMonth(data.month, -1))}
        />
        <View className="flex-row items-center gap-2">
          <Text
            className="text-base font-semibold text-foreground"
            accessibilityLiveRegion="polite"
          >
            {monthTitle(data.month)}
          </Text>
          {q.isFetching && <ActivityIndicator size="small" color={theme.mutedForeground} />}
        </View>
        <MonthButton
          icon="chevronRight"
          label="Next month"
          disabled={atCurrentMonth}
          onPress={() => setMonth(shiftMonth(data.month, 1))}
        />
      </View>

      <Card className="gap-4 p-4">
        <View className="gap-2">
          <View className="flex-row items-end justify-between">
            <Text className="text-3xl font-semibold tracking-tight text-foreground">
              {pct === null ? '—' : `${pct}%`}
            </Text>
            <Text className="pb-1 text-xs text-muted-foreground">
              {mt.marked} of {data.schoolDays} school day{data.schoolDays === 1 ? '' : 's'} marked
            </Text>
          </View>
          <Meter
            value={(pct ?? 0) / 100}
            tone={pct !== null && pct < 75 ? 'danger' : 'primary'}
            label={`Attendance ${pct ?? 0} percent this month`}
          />
        </View>
        <View className="flex-row gap-2">
          {STATUSES.map((s) => {
            const on = filter === s;
            return (
              <Pressable
                key={s}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${STATUS_META[s].label}: ${mt.counts[s]} days${on ? ', showing these days' : ''}`}
                onPress={() => setFilter(on ? undefined : s)}
                className={`flex-1 items-center gap-1 rounded-xl border py-2.5 ${on ? 'border-primary bg-primary/10' : 'border-border bg-background active:bg-muted'}`}
              >
                <View className="flex-row items-center gap-1.5">
                  <View className={`size-2 rounded-full ${STATUS_META[s].dot}`} />
                  <Text className="text-lg font-semibold text-foreground">{mt.counts[s]}</Text>
                </View>
                <Text
                  className={`text-[11px] font-medium ${on ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  {STATUS_META[s].label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View className="flex-row items-center gap-2 border-t border-border pt-3">
          <Icon name="history" size={16} />
          <Text className="flex-1 text-xs text-muted-foreground">
            {st.marked === 0
              ? 'No registers taken yet this session.'
              : `This session: ${st.percentage}% over ${st.marked} day${st.marked === 1 ? '' : 's'} · ${st.counts.ABSENT} absent, ${st.counts.LATE} late, ${st.counts.LEAVE} on leave`}
          </Text>
        </View>
      </Card>

      <MonthGrid data={data} highlight={filter} />

      <View className="gap-2.5">
        <SectionTitle
          title={filter ? `${STATUS_META[filter].label} days` : 'Absent, late & leave'}
        />
        {listed.length === 0 ? (
          <Card>
            <EmptyState
              icon={filter ? 'search' : 'check'}
              title={
                filter
                  ? `No ${STATUS_META[filter].label.toLowerCase()} days`
                  : mt.marked
                    ? 'Present every day marked'
                    : 'No registers this month'
              }
              description={
                mt.marked ? undefined : 'Marks appear here once class registers are taken.'
              }
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {listed.map((d, i) => (
              <View
                key={d.date}
                className={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 ${i === listed.length - 1 ? '' : 'border-b border-border'}`}
              >
                <View className="flex-1 gap-0.5">
                  <Text className="text-base font-medium text-foreground">{longDay(d.date)}</Text>
                  {d.remark ? (
                    <Text className="text-xs text-muted-foreground">{d.remark}</Text>
                  ) : null}
                </View>
                <Pill label={STATUS_META[d.status!].label} tone={TONE[d.status!]} />
              </View>
            ))}
          </Card>
        )}
      </View>
    </View>
  );
}

/** The month Monday-first: each day's mark as a coloured dot; days off greyed, the future faded. */
function MonthGrid({ data, highlight }: { data: MonthData; highlight?: AttendanceStatus }) {
  const cells = useMemo(() => {
    const lead = data.days.length ? (data.days[0]!.weekday + 6) % 7 : 0;
    const out: (MonthData['days'][number] | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...data.days,
    ];
    while (out.length % 7) out.push(null);
    return out;
  }, [data]);

  return (
    <Card className="p-3">
      <View className="flex-row">
        {WEEKDAYS.map((w) => (
          <Text
            key={w}
            className="flex-1 pb-1 text-center text-xs font-medium text-muted-foreground"
          >
            {w}
          </Text>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {cells.map((d, i) => {
          if (!d) return <View key={`pad-${i}`} className="aspect-square w-[14.2857%]" />;
          const dim = highlight && d.status !== highlight;
          const isToday = d.date === data.today;
          return (
            <View
              key={d.date}
              className="aspect-square w-[14.2857%] p-0.5"
              accessible
              accessibilityLabel={`${longDay(d.date)}: ${d.status ? STATUS_META[d.status].label : d.dayOff ? d.dayOff : d.isFuture ? 'not yet' : 'no mark'}`}
            >
              <View
                className={`flex-1 items-center justify-center gap-0.5 rounded-lg ${d.dayOff ? 'bg-muted' : ''} ${isToday ? 'border border-primary' : ''} ${
                  d.isFuture || dim ? 'opacity-30' : ''
                }`}
              >
                <Text
                  className={`text-sm ${d.dayOff ? 'text-muted-foreground' : 'text-foreground'}`}
                >
                  {Number(d.date.slice(8))}
                </Text>
                <View
                  className={`size-1.5 rounded-full ${d.status ? STATUS_META[d.status].dot : 'bg-transparent'}`}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View className="flex-row flex-wrap justify-center gap-x-3 gap-y-1 pt-2">
        {STATUSES.map((s) => (
          <View key={s} className="flex-row items-center gap-1">
            <View className={`size-2 rounded-full ${STATUS_META[s].dot}`} />
            <Text className="text-xs text-muted-foreground">{STATUS_META[s].label}</Text>
          </View>
        ))}
        <View className="flex-row items-center gap-1">
          <View className="size-2.5 rounded bg-muted" />
          <Text className="text-xs text-muted-foreground">Day off</Text>
        </View>
      </View>
    </Card>
  );
}

function MonthButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevronLeft' | 'chevronRight';
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`size-11 items-center justify-center rounded-full border border-border bg-card active:bg-muted ${disabled ? 'opacity-30' : ''}`}
    >
      <Icon name={icon} size={18} color="foreground" />
    </Pressable>
  );
}
