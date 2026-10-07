import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Screen } from '@/components/ui/screen';
import { ChoiceChips } from '@/components/ui/list';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { CalendarSheet } from '@/components/ui/calendar';
import { Banner, EmptyState, Meter, Pill, SectionTitle } from '@/components/ui/primitives';
import { getBoard } from '@/lib/api/attendance';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';
import type { BoardSection } from '@/lib/api/types';
import { STATUS_META, STATUSES } from '@/lib/attendance-status';
import { longDay, shiftDay, shortDay } from '@/lib/dates';
import { useDaysOff } from '@/lib/days-off';

type Scope = 'mine' | 'all';
const SCOPES: { value: Scope; label: string }[] = [
  { value: 'mine', label: 'My sections' },
  { value: 'all', label: 'All sections' },
];

/**
 * The day's registers. A teacher opens on their own sections; the office
 * (`attendance.manage`) opens on every section, as on the web — either can
 * switch. Step a day at a time or tap the date for a calendar; any past day
 * can be opened, and days inside the school's catch-up window can be taken
 * (the server decides). Never past today.
 */
export default function AttendanceBoardScreen() {
  const { user } = useSession();
  const office = can(user?.permissions, Permission.ATTENDANCE_MANAGE);
  const [scope, setScope] = useState<Scope>(office ? 'all' : 'mine');
  const [date, setDate] = useState<string>();
  const [picking, setPicking] = useState(false);
  const board = useQuery({ queryKey: ['attendance-board', scope, date ?? 'today'], queryFn: () => getBoard(date, scope === 'mine') });
  const data = board.data;
  const isToday = !data || data.date === data.today;
  const dayOff = useDaysOff(data?.today);

  return (
    <Screen edges={[]} onRefresh={() => board.refetch()}>
      <ChoiceChips label="Which sections" options={SCOPES} value={scope} onChange={(v) => v && setScope(v)} />

      {data && (
        <View className="flex-row items-center gap-2">
          <DayButton icon="chevronLeft" label="Previous day" onPress={() => setDate(shiftDay(data.date, -1))} />
          <View className="flex-1 items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${longDay(data.date)}. Choose another date`}
              onPress={() => setPicking(true)}
              hitSlop={6}
              className="flex-row items-center gap-1.5 rounded-lg px-2 py-1 active:bg-muted"
            >
              <Icon name="calendar" size={16} color="primary" />
              <Text className="text-base font-semibold text-foreground">{longDay(data.date)}</Text>
            </Pressable>
            {isToday ? (
              <Text className="text-xs font-medium text-primary">Today</Text>
            ) : (
              <Pressable onPress={() => setDate(undefined)} hitSlop={8}>
                <Text className="text-xs font-medium text-primary">Back to today</Text>
              </Pressable>
            )}
          </View>
          <DayButton icon="chevronRight" label="Next day" disabled={isToday} onPress={() => setDate(shiftDay(data.date, 1) >= data.today ? undefined : shiftDay(data.date, 1))} />
        </View>
      )}

      {data && (
        <CalendarSheet
          visible={picking}
          onClose={() => setPicking(false)}
          title="Attendance for…"
          value={data.date}
          today={data.today}
          earliestEditable={data.earliestEditable}
          dayOff={dayOff}
          onSelect={(day) => setDate(day >= data.today ? undefined : day)}
        />
      )}

      {data && !data.dayOff && data.earliestEditable && data.date < data.earliestEditable && (
        <Banner tone="warning" icon="lock" title="View only">
          {`Teachers can take registers back to ${shortDay(data.earliestEditable)}. For an earlier day, ask the school office to take or correct it.`}
        </Banner>
      )}

      {data?.dayOff && (
        <Banner tone="info" icon="calendarOff" title="No school">
          {`${data.dayOff} — no register is taken this day.`}
        </Banner>
      )}

      {isToday && data && data.missed.length > 0 && (
        <Banner tone="warning" icon="history" title={`${data.missed.length} earlier register${data.missed.length === 1 ? '' : 's'} to take`}>
          <View className="mt-1.5 flex-row flex-wrap gap-2">
            {data.missed.map((m) => (
              <Link key={`${m.date}-${m.section._id}`} href={{ pathname: '/attendance/[sectionId]', params: { sectionId: m.section._id, date: m.date } }} asChild>
                <Pressable className="rounded-lg border border-warning/40 bg-card px-2.5 py-1.5 active:opacity-80">
                  <Text className="text-xs font-medium text-foreground">
                    {m.class.name}-{m.section.name} · {shortDay(m.date)}
                  </Text>
                </Pressable>
              </Link>
            ))}
          </View>
        </Banner>
      )}

      {board.isLoading ? (
        <Card className="h-32 opacity-60" />
      ) : board.isError ? (
        <Banner tone="danger" title="Couldn't load registers">
          Pull down to try again.
        </Banner>
      ) : data && data.sections.length === 0 ? (
        <Card>
          {scope === 'mine' ? (
            <EmptyState
              icon="attendance"
              title="No sections assigned to you"
              description={
                office
                  ? "You aren't a class teacher or subject teacher in any section. Switch to All sections to take or check any register."
                  : 'Ask the school office to make you a class teacher or assign you a subject in a section.'
              }
            />
          ) : (
            <EmptyState icon="attendance" title="No sections this session" description="Add classes and sections for the current session on the web first." />
          )}
        </Card>
      ) : (
        data &&
        !data.dayOff && (
          <View className="gap-2.5">
            <SectionTitle title={scope === 'mine' ? 'My sections' : 'All sections'} />
            {data.sections.map((s) => (
              <SectionCard key={s._id} section={s} date={isToday ? undefined : data.date} markMine={scope === 'all'} />
            ))}
          </View>
        )
      )}
    </Screen>
  );
}

function DayButton({ icon, label, disabled, onPress }: { icon: 'chevronLeft' | 'chevronRight'; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`size-11 items-center justify-center rounded-full border border-border bg-card active:bg-muted ${disabled ? 'opacity-40' : ''}`}
    >
      <Icon name={icon} size={18} color="foreground" />
    </Pressable>
  );
}

function SectionCard({ section, date, markMine }: { section: BoardSection; date?: string; markMine?: boolean }) {
  const complete = section.students > 0 && section.marked >= section.students;
  const started = section.marked > 0;
  const present = section.counts.PRESENT + section.counts.LATE;
  return (
    <Link href={{ pathname: '/attendance/[sectionId]', params: date ? { sectionId: section._id, date } : { sectionId: section._id } }} asChild>
      <Pressable className="active:opacity-90">
        <Card className="gap-3 p-4">
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1">
              <Text className="text-base font-semibold text-foreground">
                {section.class.name} · Section {section.name}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {section.students} students{markMine && section.isMine ? ' · yours' : ''}
              </Text>
            </View>
            <Pill label={complete ? 'Taken' : started ? `${section.marked}/${section.students}` : section.canMark ? 'Take register' : 'Not taken'} tone={complete ? 'success' : started ? 'warning' : section.canMark ? 'primary' : 'neutral'} />
          </View>
          {started && (
            <>
              <Meter value={present / Math.max(1, section.marked)} label="Present among students marked" />
              <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                {STATUSES.map((s) => (
                  <View key={s} className="flex-row items-center gap-1.5">
                    <View className={`size-2 rounded-full ${STATUS_META[s].dot}`} />
                    <Text className="text-xs text-muted-foreground">
                      {STATUS_META[s].label} <Text className="font-semibold text-foreground">{section.counts[s]}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>
      </Pressable>
    </Link>
  );
}
