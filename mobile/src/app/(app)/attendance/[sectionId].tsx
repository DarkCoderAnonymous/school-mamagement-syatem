import { useEffect, useMemo, useState } from 'react';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { CalendarSheet } from '@/components/ui/calendar';
import { Banner } from '@/components/ui/primitives';
import { getRegister, saveRegister } from '@/lib/api/attendance';
import { ApiRequestError } from '@/lib/api/http';
import type { AttendanceRegister, AttendanceStatus } from '@/lib/api/types';
import { STATUS_META, STATUSES } from '@/lib/attendance-status';
import { longDay } from '@/lib/dates';
import { useTheme } from '@/lib/theme';
import { useDaysOff } from '@/lib/days-off';

type Draft = Record<string, { status: AttendanceStatus | null; remark: string }>;

/** A register nobody has started opens with everyone present — tap the absentees. */
function draftFrom(reg: AttendanceRegister): Draft {
  const fresh = reg.canEdit && reg.marked === 0;
  return Object.fromEntries(reg.rows.map((r) => [r.student._id, { status: r.status ?? (fresh ? 'PRESENT' : null), remark: r.remark }]));
}

export default function RegisterScreen() {
  const { sectionId, date } = useLocalSearchParams<{ sectionId: string; date?: string }>();
  const theme = useTheme();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const key = ['attendance-register', sectionId, date ?? 'today'];
  const register = useQuery({ queryKey: key, queryFn: () => getRegister(sectionId, date) });
  const reg = register.data;

  // Edits belong to the version of the register they were made on; a save or refetch restarts from the server.
  const version = reg ? `${reg.date}|${reg.marked}|${reg.lastMarked?.at ?? ''}` : '';
  const [edits, setEdits] = useState<{ version: string; draft: Draft }>();
  const draft = useMemo<Draft>(() => (edits?.version === version ? edits.draft : reg ? draftFrom(reg) : {}), [edits, version, reg]);
  const set = (id: string, patch: Partial<Draft[string]>) =>
    setEdits({ version, draft: { ...draft, [id]: { ...(draft[id] ?? { status: null, remark: '' }), ...patch } } });
  const [noteOpen, setNoteOpen] = useState<string>();
  const [savedAt, setSavedAt] = useState<number>();
  const [picking, setPicking] = useState(false);
  const dayOff = useDaysOff(reg?.today);

  const changed = useMemo(
    () =>
      (reg?.rows ?? []).filter((r) => {
        const d = draft[r.student._id];
        return d?.status && (d.status !== r.status || d.remark.trim() !== r.remark);
      }),
    [reg, draft],
  );
  const unmarked = reg ? reg.rows.filter((r) => !draft[r.student._id]?.status).length : 0;

  /** Open this section's register for another day; unsaved marks on this one are confirmed away first. */
  const changeDate = (day: string) => {
    const next = reg && day >= reg.today ? undefined : day;
    const apply = () => router.setParams({ date: next });
    if (!changed.length) return apply();
    Alert.alert('Discard unsaved marks?', `${changed.length} change${changed.length === 1 ? '' : 's'} on this day haven't been saved.`, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: apply },
    ]);
  };

  const save = useMutation({
    mutationFn: () =>
      saveRegister({
        sectionId,
        date: reg!.date,
        entries: changed.map((r) => {
          const d = draft[r.student._id]!;
          return { studentId: r.student._id, status: d.status!, remark: d.remark.trim() || undefined };
        }),
      }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(key, saved);
      setSavedAt(Date.now());
      await queryClient.invalidateQueries({ queryKey: ['attendance-board'] });
    },
    onError: (err) => Alert.alert("Couldn't save the register", err instanceof ApiRequestError ? err.message : 'Check your connection and try again.'),
  });

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(undefined), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  // Leaving with unsaved marks asks first — retaking a register from memory is the worst outcome.
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

  const title = reg ? `${reg.class.name} · ${reg.section.name}` : 'Register';

  if (register.isLoading || !reg) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Stack.Screen options={{ title }} />
        {register.isError ? (
          <View className="w-full px-4">
            <Banner tone="danger" title="Couldn't load this register">
              {register.error instanceof ApiRequestError ? register.error.message : 'Check your connection and try again.'}
            </Banner>
          </View>
        ) : (
          <ActivityIndicator color={theme.mutedForeground} />
        )}
      </View>
    );
  }

  const counts = STATUSES.map((s) => ({ s, n: reg.rows.filter((r) => draft[r.student._id]?.status === s).length }));

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <Stack.Screen options={{ title }} />
      <FlatList
        data={reg.rows}
        keyExtractor={(r) => r.student._id}
        contentContainerClassName="gap-2 px-4 pb-6 pt-2"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="gap-3 pb-2">
            <View className="flex-row items-center justify-between">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${longDay(reg.date)}. Choose another date`}
                onPress={() => setPicking(true)}
                hitSlop={6}
                className="-ml-2 flex-row items-center gap-1.5 rounded-lg px-2 py-1 active:bg-muted"
              >
                <Icon name="calendar" size={16} color="primary" />
                <Text className="text-base font-semibold text-foreground">{longDay(reg.date)}</Text>
                <Icon name="chevronRight" size={14} />
              </Pressable>
              {reg.date === reg.today ? (
                <Text className="text-xs font-medium text-primary">Today</Text>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => changeDate(reg.today)} hitSlop={8}>
                  <Text className="text-xs font-medium text-primary">Back to today</Text>
                </Pressable>
              )}
            </View>
            {reg.classTeacher && <Text className="-mt-2 text-xs text-muted-foreground">Class teacher: {reg.classTeacher}</Text>}

            {!reg.canEdit && reg.readOnlyReason && (
              <Banner tone={reg.dayOff ? 'info' : 'warning'} icon={reg.dayOff ? 'calendarOff' : 'lock'}>
                {reg.readOnlyReason}
              </Banner>
            )}
            {reg.canEdit && reg.marked === 0 && reg.rows.length > 0 && (
              <Banner tone="info">Everyone starts as present — tap the students who are absent, late or on leave, then save.</Banner>
            )}

            <View className="flex-row flex-wrap gap-2">
              {counts.map(({ s, n }) => (
                <View key={s} className="flex-row items-center gap-1.5 rounded-lg bg-card px-2.5 py-1.5">
                  <View className={`size-2 rounded-full ${STATUS_META[s].dot}`} />
                  <Text className="text-xs text-muted-foreground">
                    {STATUS_META[s].label} <Text className="font-semibold text-foreground">{n}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<Text className="py-10 text-center text-sm text-muted-foreground">No students in this section.</Text>}
        renderItem={({ item: r }) => {
          const d = draft[r.student._id] ?? { status: r.status, remark: r.remark };
          const name = `${r.student.firstName} ${r.student.lastName}`;
          const showNote = noteOpen === r.student._id || !!d.remark;
          return (
            <View className="gap-2.5 rounded-2xl border border-border bg-card p-3.5">
              <View className="flex-row items-center gap-3">
                <View className="size-9 items-center justify-center rounded-full bg-muted">
                  <Text className="text-xs font-semibold text-muted-foreground">{r.student.rollNumber ?? '—'}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base font-medium text-foreground" numberOfLines={1}>
                    {name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{r.student.admissionNumber}</Text>
                </View>
                {reg.canEdit && !showNote && (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Add a note for ${name}`} hitSlop={10} onPress={() => setNoteOpen(r.student._id)} className="size-9 items-center justify-center rounded-full active:bg-muted">
                    <Icon name="note" size={18} />
                  </Pressable>
                )}
              </View>

              <View accessibilityRole="radiogroup" accessibilityLabel={`Attendance for ${name}`} className="flex-row gap-2">
                {STATUSES.map((s) => {
                  const on = d.status === s;
                  return (
                    <Pressable
                      key={s}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on, disabled: !reg.canEdit }}
                      accessibilityLabel={STATUS_META[s].label}
                      disabled={!reg.canEdit}
                      onPress={() => set(r.student._id, { status: s })}
                      className={`h-11 flex-1 items-center justify-center rounded-xl border ${on ? STATUS_META[s].selected : 'border-border bg-background'} ${!on && !reg.canEdit ? 'opacity-40' : ''}`}
                      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}
                    >
                      <Text className={`text-sm font-bold ${on ? STATUS_META[s].selectedText : 'text-muted-foreground'}`}>{STATUS_META[s].short}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {showNote &&
                (reg.canEdit ? (
                  <TextInput
                    value={d.remark}
                    onChangeText={(t) => set(r.student._id, { remark: t })}
                    placeholder="Note (optional) — e.g. sick, arrived at 9:30"
                    placeholderTextColor={theme.mutedForeground}
                    maxLength={200}
                    accessibilityLabel={`Note for ${name}`}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                  />
                ) : (
                  <Text className="text-xs text-muted-foreground">Note: {d.remark}</Text>
                ))}
            </View>
          );
        }}
      />

      <CalendarSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={`${reg.class.name} · ${reg.section.name} register for…`}
        value={reg.date}
        today={reg.today}
        earliestEditable={reg.earliestEditable}
        dayOff={dayOff}
        onSelect={changeDate}
      />

      {reg.canEdit && reg.rows.length > 0 && (
        <View className="gap-2 border-t border-border bg-card px-4 pb-2 pt-3">
          <Text className="text-center text-xs text-muted-foreground" accessibilityLiveRegion="polite">
            {savedAt ? '✓ Register saved' : unmarked > 0 ? `${unmarked} not marked yet` : changed.length ? `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}` : 'Everyone marked'}
          </Text>
          <View className="flex-row gap-2">
            <Button
              label="All present"
              icon="checkAll"
              variant="outline"
              className="flex-1"
              onPress={() => setEdits({ version, draft: Object.fromEntries(reg.rows.map((r) => [r.student._id, { remark: draft[r.student._id]?.remark ?? '', status: 'PRESENT' as const }])) })}
            />
            <Button
              label={changed.length ? `Save (${changed.length})` : 'Saved'}
              loading={save.isPending}
              disabled={changed.length === 0}
              className="flex-1"
              onPress={() => save.mutate()}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
