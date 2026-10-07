import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Banner, EmptyState, Pill, SectionTitle } from '@/components/ui/primitives';
import { HeaderButton } from '@/components/management/header-button';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';
import {
  getAttendanceSettings,
  listHolidays,
  type AttendanceSettings,
  type Holiday,
} from '@/lib/api/teaching';
import { shiftDay, shortDay } from '@/lib/dates';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** The school week as people read it: Monday first. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_MS = 86_400_000;

/** Today on this phone's calendar, "YYYY-MM-DD". */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** "Mon 21 Dec – Fri 1 Jan · 12 days"; the year is added only when it isn't this one. */
function rangeLabel(h: Holiday, thisYear: string): string {
  const start = h.startDate.slice(0, 10);
  const end = h.endDate.slice(0, 10);
  const label = (d: string) =>
    `${shortDay(d)}${d.slice(0, 4) === thisYear ? '' : ` ${d.slice(0, 4)}`}`;
  if (start === end) return label(start);
  return `${label(start)} – ${label(end)} · ${daysBetween(start, end) + 1} days`;
}

/**
 * The school calendar attendance runs on — weekly days off, the teacher
 * catch-up window, and holidays (upcoming first, the past year below).
 * Holders of `attendance.manage` (the office, the principal) add, change and
 * remove holidays here; the school week itself is set on the web.
 */
export default function HolidaysScreen() {
  const { user } = useSession();
  const canManage = can(user?.permissions, Permission.ATTENDANCE_MANAGE);
  const [today] = useState(localToday);
  const thisYear = today.slice(0, 4);
  const settings = useQuery({ queryKey: ['attendance-settings'], queryFn: getAttendanceSettings });
  const upcoming = useInfiniteQuery({
    queryKey: ['holidays', 'upcoming', today],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => listHolidays({ page: pageParam, limit: 50, from: today }),
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });
  // The past year, newest first (the endpoint lists earliest first, so it's reversed here).
  const past = useQuery({
    queryKey: ['holidays', 'past', today],
    queryFn: () =>
      listHolidays({ limit: 100, from: shiftDay(today, -365), to: shiftDay(today, -1) }),
  });

  const upcomingItems = upcoming.data?.pages.flatMap((p) => p.items) ?? [];
  // A holiday still running today is upcoming, not past.
  const pastItems = (past.data?.items ?? [])
    .filter((h) => h.endDate.slice(0, 10) < today)
    .reverse();

  return (
    <Screen
      edges={[]}
      onRefresh={() => Promise.all([settings.refetch(), upcoming.refetch(), past.refetch()])}
    >
      <Stack.Screen
        options={{
          title: 'Holidays & days off',
          headerRight: canManage
            ? () => (
                <HeaderButton
                  label="Add"
                  accessibilityLabel="Add a holiday"
                  onPress={() => router.push('/modules/holidays/form')}
                />
              )
            : undefined,
        }}
      />

      <View className="gap-2.5">
        <SectionTitle title="School week" />
        {settings.isLoading ? (
          <Card className="h-36 opacity-60" />
        ) : settings.isError || !settings.data ? (
          <Banner tone="danger" title="Couldn't load the school week">
            Pull down to try again.
          </Banner>
        ) : (
          <SchoolWeek settings={settings.data} />
        )}
      </View>

      <View className="gap-2.5">
        <SectionTitle title="Upcoming holidays" />
        {upcoming.isLoading ? (
          <Card className="h-24 opacity-60" />
        ) : upcoming.isError ? (
          <Banner tone="danger" title="Couldn't load holidays">
            Pull down to try again.
          </Banner>
        ) : upcomingItems.length === 0 ? (
          <Card>
            <EmptyState
              icon="calendar"
              title="No holidays coming up"
              description={
                canManage
                  ? 'Add public holidays and breaks so no register is expected on those days.'
                  : 'Public holidays and breaks appear here once the school office announces them.'
              }
            />
            {canManage && (
              <View className="px-4 pb-4">
                <Button
                  label="Add a holiday"
                  icon="plus"
                  onPress={() => router.push('/modules/holidays/form')}
                />
              </View>
            )}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {upcomingItems.map((h, i) => (
              <HolidayRow
                key={h._id}
                holiday={h}
                today={today}
                thisYear={thisYear}
                editable={canManage}
                last={i === upcomingItems.length - 1}
              />
            ))}
          </Card>
        )}
        {upcoming.hasNextPage && (
          <Button
            label="Show more"
            variant="outline"
            size="sm"
            loading={upcoming.isFetchingNextPage}
            onPress={() => upcoming.fetchNextPage()}
          />
        )}
      </View>

      {pastItems.length > 0 && (
        <View className="gap-2.5">
          <SectionTitle title="Past 12 months" />
          <Card className="overflow-hidden">
            {pastItems.map((h, i) => (
              <HolidayRow
                key={h._id}
                holiday={h}
                today={today}
                thisYear={thisYear}
                editable={canManage}
                past
                last={i === pastItems.length - 1}
              />
            ))}
          </Card>
        </View>
      )}
    </Screen>
  );
}

function SchoolWeek({ settings }: { settings: AttendanceSettings }) {
  const off = new Set(settings.weeklyOffDays);
  const offNames = WEEK_ORDER.filter((d) => off.has(d)).map((d) => WEEKDAYS[d]);
  const n = settings.teacherBackdateDays;
  return (
    <Card className="gap-4 p-4">
      <View
        className="flex-row gap-1.5"
        accessibilityLabel={
          offNames.length ? `Closed every ${offNames.join(' and ')}` : 'Open every day of the week'
        }
      >
        {WEEK_ORDER.map((d) => {
          const closed = off.has(d);
          return (
            <View
              key={d}
              className={`flex-1 items-center gap-0.5 rounded-xl border py-2 ${closed ? 'border-transparent bg-muted' : 'border-border bg-background'}`}
            >
              <Text
                className={`text-xs font-semibold ${closed ? 'text-muted-foreground' : 'text-foreground'}`}
              >
                {WEEKDAYS[d]!.slice(0, 3)}
              </Text>
              <Text
                className={`text-[10px] ${closed ? 'font-semibold text-muted-foreground' : 'text-muted-foreground'}`}
              >
                {closed ? 'Off' : 'Open'}
              </Text>
            </View>
          );
        })}
      </View>
      <Text className="text-sm text-foreground">
        {offNames.length
          ? `Closed every ${offNames.join(' and ')}.`
          : 'Open every day of the week.'}
      </Text>
      <View className="flex-row gap-2.5 border-t border-border pt-3">
        <Icon name="history" size={18} />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-medium text-foreground">Teacher catch-up</Text>
          <Text className="text-xs text-muted-foreground">
            {n === 0
              ? 'Registers can only be taken on the day itself.'
              : `A missed register can still be taken up to ${n} school day${n === 1 ? '' : 's'} later. Holidays and days off don't count.`}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function HolidayRow({
  holiday,
  today,
  thisYear,
  editable,
  past,
  last,
}: {
  holiday: Holiday;
  today: string;
  thisYear: string;
  editable?: boolean;
  past?: boolean;
  last?: boolean;
}) {
  const start = holiday.startDate.slice(0, 10);
  const end = holiday.endDate.slice(0, 10);
  const ongoing = !past && start <= today;
  const until = daysBetween(today, start);
  return (
    <Pressable
      disabled={!editable}
      accessibilityRole={editable ? 'button' : undefined}
      accessibilityLabel={`${holiday.name}, ${rangeLabel(holiday, thisYear)}${editable ? '. Change or remove' : ''}`}
      onPress={() =>
        router.push({
          pathname: '/modules/holidays/form',
          params: { id: holiday._id, name: holiday.name, startDate: start, endDate: end },
        })
      }
      className={`min-h-[56px] flex-row items-center gap-3 px-4 py-3 active:bg-muted ${last ? '' : 'border-b border-border'} ${past ? 'opacity-60' : ''}`}
    >
      <View
        className={`size-9 items-center justify-center rounded-lg ${past ? 'bg-muted' : 'bg-primary/10'}`}
      >
        <Icon name="calendarOff" size={18} color={past ? 'mutedForeground' : 'primary'} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text
          className={`text-base font-medium ${past ? 'text-muted-foreground' : 'text-foreground'}`}
          numberOfLines={1}
        >
          {holiday.name}
        </Text>
        <Text className="text-xs text-muted-foreground">{rangeLabel(holiday, thisYear)}</Text>
      </View>
      {ongoing ? (
        <Pill label="Now" tone="success" />
      ) : !past && until === 1 ? (
        <Pill label="Tomorrow" tone="primary" />
      ) : !past && until <= 30 ? (
        <Text className="text-xs text-muted-foreground">in {until} days</Text>
      ) : null}
      {editable && <Icon name="chevronRight" size={14} />}
    </Pressable>
  );
}
