import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Banner, EmptyState, Pill, SectionTitle } from '@/components/ui/primitives';
import { useSession } from '@/lib/auth-context';
import { SchoolToday } from '@/components/home/school-today';
import { QuickActions } from '@/components/home/quick-actions';
import { SetupChecklist } from '@/components/home/setup-checklist';
import { can } from '@/lib/modules';
import { useResolvedScheme, useThemeMode } from '@/lib/theme-mode';
import { getMyBoard, getMyClasses } from '@/lib/api/attendance';
import type { BoardSection } from '@/lib/api/types';
import { greeting, longDay, shortDay } from '@/lib/dates';

/**
 * A teacher's day at a glance: registers to take (today's, plus any left
 * over from leave), then the classes they teach. Pull down to refresh.
 */
export default function HomeScreen() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const scheme = useResolvedScheme();
  const { setMode } = useThemeMode();
  const canAttend = !!user?.permissions.includes(Permission.ATTENDANCE_READ);
  // The office sees every section on the School card; "your registers" only matters if they teach one.
  const office = can(user?.permissions, Permission.ATTENDANCE_MANAGE);
  const board = useQuery({
    queryKey: ['attendance-board', 'mine', 'today'],
    queryFn: () => getMyBoard(),
    enabled: canAttend,
  });
  const classes = useQuery({
    queryKey: ['my-classes'],
    queryFn: getMyClasses,
    enabled: !!user?.permissions.includes(Permission.CLASS_READ),
  });

  const today = board.data?.today;
  const sections = board.data?.sections ?? [];
  const done = sections.filter((s) => s.students > 0 && s.marked >= s.students).length;

  return (
    <Screen
      onRefresh={() =>
        Promise.all([
          board.refetch(),
          classes.refetch(),
          queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        ])
      }
    >
      <View className="flex-row items-center justify-between gap-3 pt-2">
        <View className="flex-1 gap-0.5">
          <Text className="text-[26px] font-semibold tracking-tight text-foreground">
            {greeting()}
            {user?.firstName ? `, ${user.firstName}` : ''}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {[user?.schoolName, today ? longDay(today) : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={scheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          hitSlop={4}
          onPress={() => setMode(scheme === 'dark' ? 'light' : 'dark')}
          className="size-11 items-center justify-center rounded-full border border-border bg-card active:bg-muted"
        >
          <Icon name={scheme === 'dark' ? 'sun' : 'moon'} size={20} color="foreground" />
        </Pressable>
        <Link href="/profile" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            className="size-11 items-center justify-center rounded-full bg-primary/10"
          >
            <Text className="text-sm font-semibold text-primary">
              {(user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')}
            </Text>
          </Pressable>
        </Link>
      </View>

      <SetupChecklist />
      <QuickActions />
      <SchoolToday />

      {canAttend && board.data?.dayOff && (
        <Banner tone="info" icon="calendarOff" title="No school today">
          {board.data.dayOff}
        </Banner>
      )}

      {canAttend && board.data && board.data.missed.length > 0 && (
        <Card className="gap-3 border-warning/40 p-4">
          <View className="flex-row items-center gap-2">
            <Icon name="history" size={18} color="warningInk" />
            <Text className="flex-1 text-sm font-semibold text-foreground">
              {board.data.missed.length} earlier register{board.data.missed.length === 1 ? '' : 's'}{' '}
              to take
            </Text>
          </View>
          {board.data.earliestEditable && (
            <Text className="text-xs text-muted-foreground">
              Back from leave? You can take these until {shortDay(board.data.earliestEditable)}.
            </Text>
          )}
          <View className="gap-2">
            {board.data.missed.map((m) => (
              <Link
                key={`${m.date}-${m.section._id}`}
                href={{
                  pathname: '/attendance/[sectionId]',
                  params: { sectionId: m.section._id, date: m.date },
                }}
                asChild
              >
                <Pressable className="flex-row items-center justify-between rounded-xl bg-warning-soft px-3 py-2.5 active:opacity-80">
                  <Text className="text-sm font-medium text-foreground">
                    {m.class.name} · {m.section.name}{' '}
                    <Text className="text-muted-foreground">— {shortDay(m.date)}</Text>
                  </Text>
                  <Text className="text-xs font-semibold text-warning-ink">
                    {m.marked}/{m.students}
                  </Text>
                </Pressable>
              </Link>
            ))}
          </View>
        </Card>
      )}

      {canAttend &&
        !board.data?.dayOff &&
        !(office && board.isSuccess && sections.length === 0) && (
          <View className="gap-2.5">
            <SectionTitle
              title="Today's registers"
              action={
                sections.length > 0 ? (
                  <Text className="text-xs font-medium text-muted-foreground">
                    {done} of {sections.length} done
                  </Text>
                ) : undefined
              }
            />
            {board.isLoading ? (
              <Card className="h-24 opacity-60" />
            ) : sections.length === 0 ? (
              <Card>
                <EmptyState
                  icon="attendance"
                  title="No sections yet"
                  description="You'll see a register here once you're a class teacher or teach a subject in a section."
                />
              </Card>
            ) : (
              <Card className="overflow-hidden">
                {sections.map((s, i) => (
                  <RegisterRow key={s._id} section={s} last={i === sections.length - 1} />
                ))}
              </Card>
            )}
          </View>
        )}

      {classes.data && classes.data.sections.length > 0 && (
        <View className="gap-2.5">
          <SectionTitle title="My classes" />
          {classes.data.sections.map((c) => (
            <Card key={c.section._id} className="gap-2.5 p-4">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-base font-semibold text-foreground">
                  {c.class.name} · {c.section.name}
                </Text>
                {c.isClassTeacher && <Pill label="Class teacher" tone="primary" />}
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {c.subjects.length ? (
                  c.subjects.map((sub) => (
                    <View
                      key={sub._id}
                      className="flex-row items-center gap-1 rounded-lg bg-muted px-2 py-1"
                    >
                      <Icon name="book" size={13} />
                      <Text className="text-xs font-medium text-foreground">{sub.name}</Text>
                    </View>
                  ))
                ) : (
                  <Text className="text-xs text-muted-foreground">No subjects assigned here</Text>
                )}
              </View>
            </Card>
          ))}
        </View>
      )}

      {!canAttend && !user?.permissions.some((p) => p !== 'notice.read') && (
        <Card>
          <EmptyState
            icon="school"
            title="Welcome"
            description="Your school's updates for you will appear here."
          />
        </Card>
      )}
    </Screen>
  );
}

function RegisterRow({ section, last }: { section: BoardSection; last: boolean }) {
  const complete = section.students > 0 && section.marked >= section.students;
  const started = section.marked > 0;
  return (
    <Link
      href={{ pathname: '/attendance/[sectionId]', params: { sectionId: section._id } }}
      asChild
    >
      <Pressable
        className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-muted ${last ? '' : 'border-b border-border'}`}
      >
        <View
          className={`size-10 items-center justify-center rounded-xl ${complete ? 'bg-success-soft' : 'bg-primary/10'}`}
        >
          <Icon
            name={complete ? 'check' : 'attendance'}
            size={20}
            color={complete ? 'success' : 'primary'}
          />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold text-foreground">
            {section.class.name} · {section.name}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {complete
              ? `${section.counts.PRESENT + section.counts.LATE} present · ${section.counts.ABSENT} absent`
              : `${section.students} student${section.students === 1 ? '' : 's'}`}
          </Text>
        </View>
        <Pill
          label={complete ? 'Taken' : started ? `${section.marked}/${section.students}` : 'Take'}
          tone={complete ? 'success' : started ? 'warning' : 'primary'}
        />
        <Icon name="chevronRight" size={16} />
      </Pressable>
    </Link>
  );
}
