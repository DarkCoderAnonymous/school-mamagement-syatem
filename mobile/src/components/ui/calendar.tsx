import { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { shortDay } from '@/lib/dates';
import { useTheme } from '@/lib/theme';
import { Button } from './button';
import { Icon } from './icon';

/**
 * Pick a calendar day from a month grid (no native picker is installed).
 * Days are "YYYY-MM-DD". Nothing after `today` can be chosen unless
 * `allowFuture` (planning a holiday), nor anything before `minDay`; `dayOff`
 * marks holidays/weekly days off (with the reason), and days before
 * `earliestEditable` are marked "view only" so the choice's consequence is
 * visible before it's made.
 */
export interface CalendarSheetProps {
  visible: boolean;
  onClose: () => void;
  value: string;
  today: string;
  onSelect: (day: string) => void;
  title?: string;
  /** Why a day has no register (holiday name, "Sunday"), or null on a school day. */
  dayOff?: (day: string) => string | null;
  /** The earliest day the user may change; earlier days are shown as view-only. Null = no limit. */
  earliestEditable?: string | null;
  /** Let days after today be chosen, and months after this one be shown. */
  allowFuture?: boolean;
  /** Days before this can't be chosen (a range's last day after its first). */
  minDay?: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n: number) => String(n).padStart(2, '0');
const monthOf = (day: string) => day.slice(0, 7);
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
const monthTitle = (month: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/** The month's days laid out Monday-first, padded with nulls. */
function grid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(`${month}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function CalendarSheet({
  visible,
  onClose,
  value,
  today,
  onSelect,
  title = 'Choose a date',
  dayOff,
  earliestEditable,
  allowFuture,
  minDay,
}: CalendarSheetProps) {
  const [month, setMonth] = useState(monthOf(value));
  const [lastValue, setLastValue] = useState(value);
  // Reopening on another date shows that date's month.
  if (value !== lastValue) {
    setLastValue(value);
    setMonth(monthOf(value));
  }
  const [peek, setPeek] = useState<string>();
  const theme = useTheme();
  const cells = useMemo(() => grid(month), [month]);
  const atLastMonth = !allowFuture && month >= monthOf(today);
  const peekOff = peek && dayOff ? dayOff(peek) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close calendar"
        className="flex-1 bg-foreground/30"
        onPress={onClose}
      />
      <SafeAreaView
        edges={['bottom']}
        style={{ backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
      >
        <View className="px-4 pb-2 pt-3">
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-border" />
          <View className="flex-row items-center justify-between pb-3">
            <Text className="text-lg font-semibold text-foreground">{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={onClose}
              className="size-9 items-center justify-center rounded-full bg-muted"
            >
              <Icon name="close" size={16} color="foreground" />
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between pb-2">
            <MonthButton
              icon="chevronLeft"
              label="Previous month"
              onPress={() => setMonth(shiftMonth(month, -1))}
            />
            <Text
              className="text-base font-semibold text-foreground"
              accessibilityLiveRegion="polite"
            >
              {monthTitle(month)}
            </Text>
            <MonthButton
              icon="chevronRight"
              label="Next month"
              disabled={atLastMonth}
              onPress={() => setMonth(shiftMonth(month, 1))}
            />
          </View>

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
            {cells.map((day, i) => {
              if (!day) return <View key={`pad-${i}`} className="aspect-square w-[14.2857%]" />;
              const future = day > today;
              const blocked = (future && !allowFuture) || (!!minDay && day < minDay);
              const off = dayOff?.(day) ?? null;
              const selected = day === value;
              const isToday = day === today;
              const viewOnly = !future && !!earliestEditable && day < earliestEditable;
              return (
                <View key={day} className="aspect-square w-[14.2857%] p-0.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: blocked }}
                    accessibilityLabel={`${day}${isToday ? ', today' : ''}${off ? `, ${off}` : ''}${viewOnly ? ', view only' : ''}`}
                    disabled={blocked}
                    onPress={() => {
                      if (off) {
                        // A day off opens nothing useful — say why instead of navigating.
                        setPeek(day);
                        return;
                      }
                      setPeek(undefined);
                      onSelect(day);
                      onClose();
                    }}
                    className={`flex-1 items-center justify-center rounded-xl ${
                      selected
                        ? 'bg-primary'
                        : isToday
                          ? 'border border-primary'
                          : off
                            ? 'bg-muted'
                            : 'active:bg-muted'
                    } ${blocked ? 'opacity-30' : ''}`}
                  >
                    <Text
                      className={`text-base ${
                        selected
                          ? 'font-semibold text-primary-foreground'
                          : off || viewOnly
                            ? 'text-muted-foreground'
                            : isToday
                              ? 'font-semibold text-primary'
                              : 'text-foreground'
                      }`}
                    >
                      {Number(day.slice(8))}
                    </Text>
                    {off && !selected && (
                      <View className="absolute bottom-1.5 size-1 rounded-full bg-muted-foreground" />
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View className="min-h-[40px] justify-center gap-1 pt-2">
            {peekOff ? (
              <Text className="text-center text-sm text-foreground">
                {new Intl.DateTimeFormat('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'UTC',
                }).format(new Date(`${peek}T00:00:00Z`))}{' '}
                — {peekOff}. No register that day.
              </Text>
            ) : (
              <View className="flex-row flex-wrap justify-center gap-x-4 gap-y-1">
                <Legend swatch="border border-primary" label="Today" />
                {dayOff && <Legend swatch="bg-muted" label="Day off" />}
                {earliestEditable && (
                  <Text className="text-xs text-muted-foreground">
                    Days before {shortDay(earliestEditable)} are view only
                  </Text>
                )}
              </View>
            )}
          </View>

          {(!minDay || today >= minDay) && (
            <Button
              label="Today"
              variant="outline"
              className="mt-2"
              onPress={() => {
                setPeek(undefined);
                onSelect(today);
                onClose();
              }}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
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
      className={`size-11 items-center justify-center rounded-full border border-border bg-background active:bg-muted ${disabled ? 'opacity-30' : ''}`}
    >
      <Icon name={icon} size={18} color="foreground" />
    </Pressable>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`size-3 rounded ${swatch}`} />
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}
