/**
 * Date-sheet helpers. Paper dates are calendar days stored as UTC midnight,
 * so the weekday is read in UTC — never the browser's zone, which would put
 * a Monday paper on Sunday for anyone west of Greenwich.
 */

const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' });
const LONG_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "2026-10-05" or an ISO instant → "Monday". */
export function weekday(day: string | null | undefined): string {
  if (!day) return '';
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : WEEKDAY.format(d);
}

/** "2026-10-05" → "5 Oct 2026", the way a printed date sheet reads. */
export function sheetDate(day: string | null | undefined): string {
  if (!day) return '';
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : LONG_DAY.format(d);
}

export const isSunday = (day: string | null | undefined) => Boolean(day) && new Date(`${day!.slice(0, 10)}T00:00:00Z`).getUTCDay() === 0;

/**
 * `count` consecutive exam days from `start` to `end` (inclusive, "YYYY-MM-DD"),
 * skipping Sundays — the usual one-paper-a-day sheet. Returns fewer days
 * than asked when the exam window is too short.
 */
export function examDays(start: string, end: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const last = new Date(`${end.slice(0, 10)}T00:00:00Z`);
  while (out.length < count && d <= last) {
    if (d.getUTCDay() !== 0) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** "14:00" → "2:00 PM". */
export function clockTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
