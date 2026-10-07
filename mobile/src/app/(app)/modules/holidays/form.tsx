import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { CalendarSheet } from '@/components/ui/calendar';
import { FormSection } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Banner } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/text-field';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';
import { longDay } from '@/lib/dates';
import { ApiRequestError } from '@/lib/api/http';
import { createHoliday, deleteHoliday, findHoliday, updateHoliday } from '@/lib/api/teaching';

const DAY_MS = 86_400_000;
/** The server's limit (attendance/holidays.service MAX_SPAN_DAYS). */
const MAX_SPAN_DAYS = 90;

/** Today on this phone's calendar, "YYYY-MM-DD". */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const spanDays = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS) + 1;

/**
 * Add or change a holiday — one day, or a run of days (a break). No register
 * can be taken on those days, and they don't count towards the teachers'
 * catch-up window. Opened with the holiday's id to edit it: the fields in the
 * link only fill the form while the holiday loads — what is shown and saved
 * comes from the server's record (a link can say anything).
 */
export default function HolidayFormScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    startDate?: string;
    endDate?: string;
  }>();
  const id = params.id;
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [today] = useState(localToday);
  const [name, setName] = useState(params.name ?? '');
  const [start, setStart] = useState(params.startDate ?? '');
  const [end, setEnd] = useState(
    params.endDate && params.endDate !== params.startDate ? params.endDate : '',
  );
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = can(user?.permissions, Permission.ATTENDANCE_MANAGE);
  const record = useQuery({
    queryKey: ['holidays', 'one', id],
    queryFn: () => findHoliday(id!),
    enabled: Boolean(id) && canManage,
  });
  // Replace the link's fields with the server's once, when the record arrives;
  // after that the form holds the person's edits.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (record.data && loadedId !== record.data._id) {
    const first = record.data.startDate.slice(0, 10);
    const last = record.data.endDate.slice(0, 10);
    setLoadedId(record.data._id);
    setName(record.data.name);
    setStart(first);
    setEnd(last !== first ? last : '');
  }
  /** Editing needs the server's record in the form; adding needs nothing. */
  const ready = !id || (record.data != null && loadedId === id);

  const refresh = async () => {
    // Days off feed the registers, the calendar pickers, the home card and each student's month.
    await Promise.all(
      [['holidays'], ['attendance-board'], ['dashboard'], ['student-attendance']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };

  const save = useMutation({
    mutationFn: () => {
      const input = { name: name.trim(), startDate: start, endDate: end || start };
      return id ? updateHoliday(id, input) : createHoliday(input);
    },
    onSuccess: async () => {
      await refresh();
      router.back();
    },
    onError: (err) =>
      setError(
        err instanceof ApiRequestError ? err.message : 'Check your connection and try again.',
      ),
  });
  const remove = useMutation({
    mutationFn: () => deleteHoliday(id!),
    onSuccess: async () => {
      await refresh();
      router.back();
    },
    onError: (err) =>
      Alert.alert(
        "Couldn't remove the holiday",
        err instanceof ApiRequestError ? err.message : 'Check your connection and try again.',
      ),
  });

  if (!canManage) {
    return (
      <View className="flex-1 bg-background px-4 pt-3">
        <Stack.Screen options={{ title: 'Holiday' }} />
        <Banner tone="warning" icon="lock" title="Not available">
          Only the school office can add or change holidays.
        </Banner>
      </View>
    );
  }

  // A failed background refetch keeps the loaded record, so only a first load
  // that failed counts; and a holiday just removed here isn't "not found".
  const loadFailed = record.isError && record.data === undefined;
  const removed = remove.isPending || remove.isSuccess;
  if (id && !removed && (loadFailed || record.data === null)) {
    return (
      <View className="flex-1 bg-background px-4 pt-3">
        <Stack.Screen options={{ title: 'Holiday' }} />
        {loadFailed ? (
          <Banner tone="danger" title="Couldn't load this holiday">
            Go back and try again.
          </Banner>
        ) : (
          <Banner tone="warning" title="Holiday not found">
            It may have been removed. Go back to see the school&apos;s holidays.
          </Banner>
        )}
      </View>
    );
  }

  const span = start && end ? spanDays(start, end) : 1;
  const spanError =
    span > MAX_SPAN_DAYS ? `A holiday can span at most ${MAX_SPAN_DAYS} days` : undefined;
  const valid = ready && name.trim().length > 0 && Boolean(start) && !spanError;
  const busy = save.isPending || remove.isPending;

  const confirmRemove = () =>
    Alert.alert(
      `Remove ${record.data?.name ?? 'this holiday'}?`,
      'Those days become school days again, and registers can be taken on them.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() },
      ],
    );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: id ? 'Change holiday' : 'Add holiday' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="gap-5 px-4 pb-8 pt-3"
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <FormSection>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              maxLength={80}
              placeholder="e.g. Independence Day, Winter break"
              autoFocus={!id}
            />
            <DayButton
              label="First day"
              value={start}
              placeholder="Choose a day"
              onPress={() => setPicking('start')}
            />
            <DayButton
              label="Last day"
              value={end}
              placeholder="Same day (one-day holiday)"
              hint={start && end ? `${span} days` : 'Set a last day for a break of several days'}
              error={spanError}
              onPress={() => setPicking('end')}
              onClear={end ? () => setEnd('') : undefined}
            />
          </FormSection>

          {start && start < today ? (
            <Banner tone="warning" title="This holiday is in the past">
              Registers already taken on these days stay on record, but no new ones can be taken.
            </Banner>
          ) : (
            <Banner tone="info">
              No register can be taken on a holiday, and it doesn&apos;t count towards the
              teachers&apos; catch-up window.
            </Banner>
          )}

          {error && (
            <Text
              accessibilityRole="alert"
              className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
            >
              {error}
            </Text>
          )}
          <Button
            label={id ? 'Save changes' : 'Add holiday'}
            icon={id ? undefined : 'plus'}
            loading={save.isPending}
            disabled={!valid || busy}
            onPress={() => save.mutate()}
          />
          {id && (
            <Button
              label="Remove holiday"
              icon="trash"
              variant="destructive"
              loading={remove.isPending}
              disabled={!ready || busy}
              onPress={confirmRemove}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <CalendarSheet
        visible={picking !== null}
        onClose={() => setPicking(null)}
        title={picking === 'end' ? 'Last day' : 'First day'}
        value={(picking === 'end' ? end || start : start) || today}
        today={today}
        allowFuture
        minDay={picking === 'end' ? start || undefined : undefined}
        onSelect={(day) => {
          if (picking === 'end') {
            setEnd(day === start ? '' : day);
          } else {
            setStart(day);
            // Keep the range the right way round.
            if (end && end < day) setEnd('');
          }
          setError(null);
        }}
      />
    </View>
  );
}

function DayButton({
  label,
  value,
  placeholder,
  hint,
  error,
  onPress,
  onClear,
}: {
  label: string;
  value: string;
  placeholder: string;
  hint?: string;
  error?: string;
  onPress: () => void;
  onClear?: () => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? longDay(value) : placeholder}`}
          onPress={onPress}
          className={`h-12 flex-1 flex-row items-center gap-2.5 rounded-xl border bg-card px-3.5 active:bg-muted ${error ? 'border-destructive' : 'border-input'}`}
        >
          <Icon name="calendar" size={18} color={value ? 'primary' : 'mutedForeground'} />
          <Text
            className={`flex-1 text-base ${value ? 'text-foreground' : 'text-muted-foreground'}`}
            numberOfLines={1}
          >
            {value ? `${longDay(value)} ${value.slice(0, 4)}` : placeholder}
          </Text>
        </Pressable>
        {onClear && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            onPress={onClear}
            className="size-12 items-center justify-center rounded-xl border border-border bg-card active:bg-muted"
          >
            <Icon name="close" size={16} color="foreground" />
          </Pressable>
        )}
      </View>
      {error ? (
        <Text className="text-xs text-destructive">{error}</Text>
      ) : hint ? (
        <Text className="text-xs text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
}
