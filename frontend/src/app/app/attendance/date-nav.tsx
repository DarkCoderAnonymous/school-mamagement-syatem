'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DAY_MS = 86_400_000;
export const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** "Monday, 28 September 2026" for a calendar day. Formatted in UTC, where calendar days are stored. */
export function longDate(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/**
 * The day a register is for, always spelled out, with a step back/forward and
 * a picker. Nothing after the school's today; `onChange(undefined)` means today.
 */
export function DateNav({ date, today, onChange }: { date: string; today: string; onChange: (day: string | undefined) => void }) {
  const go = (day: string) => onChange(day >= today ? undefined : day);
  const isToday = date === today;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => go(shiftDay(date, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Next day" disabled={isToday} onClick={() => go(shiftDay(date, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <p className="text-base font-semibold" aria-live="polite">
        {longDate(date)}
        {isToday && <span className="bg-primary/10 text-primary ml-2 rounded px-1.5 py-0.5 align-middle text-xs font-medium">Today</span>}
      </p>
      <label className="ml-auto flex items-center gap-2">
        <span className="sr-only">Pick a date</span>
        <Input type="date" className="h-9 w-40" value={date} max={today} onChange={(e) => e.target.value && go(e.target.value)} />
      </label>
      {!isToday && (
        <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
          Back to today
        </Button>
      )}
    </div>
  );
}
