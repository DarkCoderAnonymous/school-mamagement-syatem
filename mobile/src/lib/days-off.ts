import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAttendanceSettings, listHolidays } from './api/teaching';
import { shiftDay } from './dates';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The school's calendar for date pickers: `dayOff(day)` returns the holiday's
 * name or "Sunday is a day off", or null on a school day. Covers the last
 * year up to `today` — the range a register can be opened for. The server
 * still decides; this only labels the calendar.
 */
export function useDaysOff(today: string | undefined, enabled = true) {
  const from = today ? shiftDay(today, -370) : undefined;
  const settings = useQuery({ queryKey: ['attendance-settings'], queryFn: getAttendanceSettings, enabled, staleTime: 5 * 60_000 });
  const holidays = useQuery({
    queryKey: ['holidays', 'calendar', from, today],
    queryFn: () => listHolidays({ from, to: today, limit: 100 }),
    enabled: enabled && !!today,
    staleTime: 5 * 60_000,
  });

  // Expand holiday ranges once into a day → name map.
  const holidayOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holidays.data?.items ?? []) {
      const end = h.endDate.slice(0, 10);
      for (let d = h.startDate.slice(0, 10); d <= end; d = shiftDay(d, 1)) map.set(d, h.name);
    }
    return map;
  }, [holidays.data]);

  const weeklyOff = settings.data?.weeklyOffDays;
  return useCallback(
    (day: string): string | null => {
      const holiday = holidayOf.get(day);
      if (holiday) return holiday;
      const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
      return weeklyOff?.includes(weekday) ? `${WEEKDAYS[weekday]} is a day off` : null;
    },
    [holidayOf, weeklyOff],
  );
}
