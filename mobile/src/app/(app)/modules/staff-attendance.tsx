import { useEffect, useMemo, useState } from 'react';
import { Stack, useNavigation } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ChoiceChips } from '@/components/ui/list';
import { Banner, EmptyState } from '@/components/ui/primitives';
import { longDay, shiftDay } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { ApiRequestError } from '@/lib/api/http';
import {
  getStaffMonthSummary,
  getStaffRegister,
  saveStaffRegister,
  type StaffAttendanceStatus,
  type StaffMonthSummary,
  type StaffRegister,
} from '@/lib/api/front-office';

/** The web staff register's letters and colours (frontend/src/app/app/staff-attendance/page.tsx). */
const STATUS: Record<StaffAttendanceStatus, { label: string; short: string; selected: string; selectedText: string; dot: string; text: string }> = {
  PRESENT: { label: 'Present', short: 'P', selected: 'bg-success border-success', selectedText: 'text-success-foreground', dot: 'bg-success', text: 'text-success' },
  LATE: { label: 'Late', short: 'L', selected: 'bg-warning border-warning', selectedText: 'text-warning-foreground', dot: 'bg-warning', text: 'text-warning-ink' },
  HALF_DAY: { label: 'Half day', short: '½', selected: 'bg-warning border-warning', selectedText: 'text-warning-foreground', dot: 'bg-warning', text: 'text-warning-ink' },
  LEAVE: { label: 'Leave (paid)', short: 'Lv', selected: 'bg-info border-info', selectedText: 'text-info-foreground', dot: 'bg-info', text: 'text-info' },
  UNPAID_LEAVE: { label: 'Unpaid leave', short: 'UL', selected: 'bg-destructive border-destructive', selectedText: 'text-destructive-foreground', dot: 'bg-destructive', text: 'text-destructive' },
  ABSENT: { label: 'Absent', short: 'A', selected: 'bg-destructive border-destructive', selectedText: 'text-destructive-foreground', dot: 'bg-destructive', text: 'text-destructive' },
};
const STATUSES = Object.keys(STATUS) as StaffAttendanceStatus[];

type View_ = 'day' | 'month';

/** The office's daily staff register, and each person's month — the unpaid days payroll drafts from. */
export default function StaffAttendanceScreen() {
  const [view, setView] = useState<View_>('day');
  const [dirty, setDirty] = useState(0);

  const switchView = (v: View_ | undefined) => {
    if (!v || v === view) return;
    // The day's edits stay put (the register stays mounted); this is only a reminder.
    if (dirty > 0 && v === 'month') {
      Alert.alert('Unsaved marks', `${dirty} change${dirty === 1 ? '' : 's'} on today's register haven't been saved. They'll still be there when you come back.`, [
        { text: 'Stay', style: 'cancel' },
        { text: 'View month', onPress: () => setView(v) },
      ]);
      return;
    }
    setView(v);
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Staff attendance' }} />
      <View className="px-4 pb-1 pt-3">
        <ChoiceChips
          label="Register or month"
          options={[
            { value: 'day' as const, label: 'Daily register' },
            { value: 'month' as const, label: 'Month' },
          ]}
          value={view}
          onChange={switchView}
        />
      </View>
      <View className={view === 'day' ? 'flex-1' : 'hidden'}>
        <DailyRegister onDirtyChange={setDirty} />
      </View>
      {view === 'month' && <MonthSummary />}
    </SafeAreaView>
  );
}

type Draft = Record<string, { status: StaffAttendanceStatus | null; remark: string }>;

/** A day nobody has started opens with everyone present (staff on leave as paid leave) — mark the exceptions. */
function draftFrom(reg: StaffRegister): Draft {
  const fresh = reg.canEdit && reg.marked === 0;
  return Object.fromEntries(
    reg.rows.map((r) => [r.employee._id, { status: r.status ?? (fresh ? (r.employee.status === 'ON_LEAVE' ? 'LEAVE' : 'PRESENT') : null), remark: r.remark }]),
  );
}

function DailyRegister({ onDirtyChange }: { onDirtyChange: (n: number) => void }) {
  const theme = useTheme();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [date, setDate] = useState<string>();
  const key = ['staff-register', date ?? 'today'];
  const register = useQuery({ queryKey: key, queryFn: () => getStaffRegister(date) });
  const reg = register.data;

  // Edits belong to the version of the register they were made on; a save or refetch restarts from the server.
  const version = reg ? `${reg.date}|${reg.marked}|${reg.lastMarked?.at ?? ''}` : '';
  const [edits, setEdits] = useState<{ version: string; draft: Draft }>();
  const draft = useMemo<Draft>(() => (edits?.version === version ? edits.draft : reg ? draftFrom(reg) : {}), [edits, version, reg]);
  const set = (id: string, patch: Partial<Draft[string]>) =>
    setEdits({ version, draft: { ...draft, [id]: { ...(draft[id] ?? { status: null, remark: '' }), ...patch } } });
  const [noteOpen, setNoteOpen] = useState<string>();
  const [savedAt, setSavedAt] = useState<number>();

  const changed = useMemo(
    () =>
      (reg?.rows ?? []).filter((r) => {
        const d = draft[r.employee._id];
        return d?.status && (d.status !== r.status || d.remark.trim() !== r.remark);
      }),
    [reg, draft],
  );
  const unmarked = reg ? reg.rows.filter((r) => !draft[r.employee._id]?.status).length : 0;

  useEffect(() => onDirtyChange(changed.length), [changed.length, onDirtyChange]);

  const save = useMutation({
    mutationFn: () =>
      saveStaffRegister({
        date: reg!.date,
        entries: changed.map((r) => {
          const d = draft[r.employee._id]!;
          return { employeeId: r.employee._id, status: d.status!, remark: d.remark.trim() || undefined };
        }),
      }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(key, saved);
      setSavedAt(Date.now());
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['staff-month'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]);
    },
    onError: (err) => Alert.alert("Couldn't save the staff register", err instanceof ApiRequestError ? err.message : 'Check your connection and try again.'),
  });

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(undefined), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  // Leaving with unsaved marks asks first.
  useEffect(() => {
    if (!changed.length || save.isPending) return;
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert('Discard unsaved marks?', `${changed.length} change${changed.length === 1 ? '' : 's'} haven't been saved.`, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
  }, [navigation, changed.length, save.isPending]);

  /** Moving to another day drops this day's edits, so ask first when there are any. */
  const goTo = (day: string | undefined) => {
    const next = reg && day && day >= reg.today ? undefined : day;
    if (!changed.length) return setDate(next);
    Alert.alert('Discard unsaved marks?', `${changed.length} change${changed.length === 1 ? '' : 's'} on this day haven't been saved.`, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setDate(next) },
    ]);
  };

  if (!reg) {
    return (
      <View className="flex-1 justify-center px-4">
        {register.isError ? (
          <Banner tone="danger" title="Couldn't load the staff register">
            {register.error instanceof ApiRequestError ? register.error.message : 'Check your connection and try again.'}
          </Banner>
        ) : (
          <ActivityIndicator color={theme.mutedForeground} />
        )}
      </View>
    );
  }

  const isToday = reg.date === reg.today;
  const counts = STATUSES.map((s) => ({ s, n: reg.rows.filter((r) => draft[r.employee._id]?.status === s).length }));

  return (
    <>
      <FlatList
        data={reg.rows}
        keyExtractor={(r) => r.employee._id}
        contentContainerClassName="gap-2 px-4 pb-6 pt-2"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={register.isRefetching}
            onRefresh={() => (changed.length ? undefined : register.refetch())}
            enabled={changed.length === 0}
            tintColor={theme.mutedForeground}
            colors={[theme.primary]}
          />
        }
        ListHeaderComponent={
          <View className="gap-3 pb-2">
            <View className="flex-row items-center gap-2">
              <NavButton icon="chevronLeft" label="Previous day" onPress={() => goTo(shiftDay(reg.date, -1))} />
              <View className="flex-1 items-center">
                <Text className="text-base font-semibold text-foreground" accessibilityLiveRegion="polite">
                  {longDay(reg.date)}
                </Text>
                {isToday ? (
                  <Text className="text-xs font-medium text-primary">Today</Text>
                ) : (
                  <Pressable onPress={() => goTo(undefined)} hitSlop={8} accessibilityRole="button">
                    <Text className="text-xs font-medium text-primary">Back to today</Text>
                  </Pressable>
                )}
              </View>
              <NavButton icon="chevronRight" label="Next day" disabled={isToday} onPress={() => goTo(shiftDay(reg.date, 1))} />
            </View>

            {!reg.canEdit && reg.readOnlyReason && (
              <Banner tone={reg.dayOff ? 'info' : 'warning'} icon={reg.dayOff ? 'calendarOff' : 'lock'} title={reg.dayOff ? 'No school' : undefined}>
                {reg.readOnlyReason}
              </Banner>
            )}
            {reg.canEdit && reg.marked === 0 && reg.rows.length > 0 && (
              <Banner tone="info">Everyone starts as present (staff on leave as paid leave) — tap the exceptions, then save.</Banner>
            )}
            {reg.lastMarked && (
              <Text className="-mt-1 text-xs text-muted-foreground">
                Last saved {formatDate(reg.lastMarked.at, true)}
                {reg.lastMarked.by ? ` by ${reg.lastMarked.by}` : ''}
              </Text>
            )}

            {reg.rows.length > 0 && (
              <View className="flex-row flex-wrap gap-2" accessibilityLabel="Counts by status">
                {counts.map(({ s, n }) => (
                  <View key={s} className="flex-row items-center gap-1.5 rounded-lg bg-card px-2.5 py-1.5">
                    <View className={`size-2 rounded-full ${STATUS[s].dot}`} />
                    <Text className="text-xs text-muted-foreground">
                      <Text className={`font-semibold ${STATUS[s].text}`}>{STATUS[s].short}</Text> {STATUS[s].label} <Text className="font-semibold text-foreground">{n}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={<EmptyState icon="staff" title="No staff on the register" description="Staff appear here once they're on payroll or added as teachers." />}
        renderItem={({ item: r }) => {
          const d = draft[r.employee._id] ?? { status: r.status, remark: r.remark };
          const name = `${r.employee.firstName} ${r.employee.lastName}`;
          const showNote = noteOpen === r.employee._id || !!d.remark;
          return (
            <View className="gap-2.5 rounded-2xl border border-border bg-card p-3.5">
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="text-base font-medium text-foreground" numberOfLines={1}>
                    {name}
                  </Text>
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {[r.employee.designation, r.employee.department, r.employee.employeeNumber].filter(Boolean).join(' · ')}
                    {r.employee.status === 'ON_LEAVE' ? ' · On leave' : ''}
                  </Text>
                </View>
                {reg.canEdit && !showNote && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add a note for ${name}`}
                    hitSlop={10}
                    onPress={() => setNoteOpen(r.employee._id)}
                    className="size-11 items-center justify-center rounded-full active:bg-muted"
                  >
                    <Icon name="note" size={18} />
                  </Pressable>
                )}
              </View>

              <View accessibilityRole="radiogroup" accessibilityLabel={`Attendance for ${name}`} className="flex-row gap-1.5">
                {STATUSES.map((s) => {
                  const on = d.status === s;
                  return (
                    <Pressable
                      key={s}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on, disabled: !reg.canEdit }}
                      accessibilityLabel={STATUS[s].label}
                      disabled={!reg.canEdit}
                      onPress={() => set(r.employee._id, { status: s })}
                      className={`h-11 flex-1 items-center justify-center rounded-xl border ${on ? STATUS[s].selected : 'border-border bg-background'} ${!on && !reg.canEdit ? 'opacity-40' : ''}`}
                      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}
                    >
                      <Text className={`text-sm font-bold ${on ? STATUS[s].selectedText : 'text-muted-foreground'}`}>{STATUS[s].short}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {showNote &&
                (reg.canEdit ? (
                  <TextInput
                    value={d.remark}
                    onChangeText={(t) => set(r.employee._id, { remark: t })}
                    placeholder="Note (optional) — e.g. doctor's appointment"
                    placeholderTextColor={theme.mutedForeground}
                    maxLength={200}
                    accessibilityLabel={`Note for ${name}`}
                    className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                  />
                ) : (
                  <Text className="text-xs text-muted-foreground">Note: {d.remark}</Text>
                ))}
            </View>
          );
        }}
      />

      {reg.canEdit && reg.rows.length > 0 && (
        <View className="gap-2 border-t border-border bg-card px-4 pb-2 pt-3">
          <Text className="text-center text-xs text-muted-foreground" accessibilityLiveRegion="polite">
            {savedAt
              ? '✓ Staff register saved'
              : unmarked > 0
                ? `${unmarked} not marked yet`
                : changed.length
                  ? `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}`
                  : 'Everyone marked'}
          </Text>
          <View className="flex-row gap-2">
            <Button
              label="All present"
              icon="checkAll"
              variant="outline"
              className="flex-1"
              onPress={() =>
                setEdits({ version, draft: Object.fromEntries(reg.rows.map((r) => [r.employee._id, { remark: draft[r.employee._id]?.remark ?? '', status: 'PRESENT' as const }])) })
              }
            />
            <Button label={changed.length ? `Save (${changed.length})` : 'Saved'} loading={save.isPending} disabled={changed.length === 0} className="flex-1" onPress={() => save.mutate()} />
          </View>
        </View>
      )}
    </>
  );
}

const thisMonth = () => new Date().toISOString().slice(0, 7);
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const monthName = (month: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

function MonthSummary() {
  const theme = useTheme();
  const [month, setMonth] = useState(thisMonth);
  const summary = useQuery({ queryKey: ['staff-month', month], queryFn: () => getStaffMonthSummary(month) });
  const data = summary.data;
  const current = month >= thisMonth();

  return (
    <FlatList
      data={data?.rows ?? []}
      keyExtractor={(r) => r.employee._id}
      contentContainerClassName="gap-2 px-4 pb-8 pt-2"
      refreshControl={<RefreshControl refreshing={summary.isRefetching} onRefresh={() => summary.refetch()} tintColor={theme.mutedForeground} colors={[theme.primary]} />}
      ListHeaderComponent={
        <View className="gap-3 pb-2">
          <View className="flex-row items-center gap-2">
            <NavButton icon="chevronLeft" label="Previous month" onPress={() => setMonth(shiftMonth(month, -1))} />
            <View className="flex-1 items-center">
              <Text className="text-base font-semibold text-foreground" accessibilityLiveRegion="polite">
                {monthName(month)}
              </Text>
              {current ? (
                <Text className="text-xs font-medium text-primary">This month</Text>
              ) : (
                <Pressable onPress={() => setMonth(thisMonth())} hitSlop={8} accessibilityRole="button">
                  <Text className="text-xs font-medium text-primary">Back to this month</Text>
                </Pressable>
              )}
            </View>
            <NavButton icon="chevronRight" label="Next month" disabled={current} onPress={() => setMonth(shiftMonth(month, 1))} />
          </View>
          {data && data.rows.length > 0 && (
            <Text className="text-xs text-muted-foreground">
              {data.schoolDays} school day{data.schoolDays === 1 ? '' : 's'} so far. Unpaid days are what the payroll draft deducts: absent and unpaid leave count 1, half day ½.
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        summary.isLoading ? (
          <ActivityIndicator className="py-10" color={theme.mutedForeground} />
        ) : summary.isError ? (
          <Banner tone="danger" title="Couldn't load the month">
            {summary.error instanceof ApiRequestError ? summary.error.message : 'Pull down to try again.'}
          </Banner>
        ) : (
          <EmptyState icon="staff" title="No staff this month" />
        )
      }
      renderItem={({ item }) => <MonthRow row={item} schoolDays={data?.schoolDays ?? 0} />}
    />
  );
}

function MonthRow({ row: r, schoolDays }: { row: StaffMonthSummary['rows'][number]; schoolDays: number }) {
  const name = `${r.employee.firstName} ${r.employee.lastName}`;
  return (
    <Card className="gap-3 p-3.5">
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text className="text-base font-medium text-foreground" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {r.employee.designation} · {r.marked}/{schoolDays} registers
          </Text>
        </View>
        <View className="items-end">
          <Text className={`text-lg font-semibold ${r.unpaidDays > 0 ? 'text-destructive' : 'text-foreground'}`}>{r.unpaidDays}</Text>
          <Text className="text-xs text-muted-foreground">unpaid day{r.unpaidDays === 1 ? '' : 's'}</Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-x-3 gap-y-1">
        {STATUSES.map((s) => (
          <Text key={s} className="text-xs text-muted-foreground" accessibilityLabel={`${STATUS[s].label}: ${r.counts[s]}`}>
            <Text className={`font-semibold ${r.counts[s] ? STATUS[s].text : 'text-muted-foreground'}`}>{STATUS[s].short}</Text> {r.counts[s]}
          </Text>
        ))}
      </View>
    </Card>
  );
}

function NavButton({ icon, label, disabled, onPress }: { icon: 'chevronLeft' | 'chevronRight'; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`size-11 items-center justify-center rounded-full border border-border bg-card active:bg-muted ${disabled ? 'opacity-40' : ''}`}
    >
      <Icon name={icon} size={18} color="foreground" />
    </Pressable>
  );
}
