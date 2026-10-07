/** Calendar-day helpers. Days are "YYYY-MM-DD" in the school's timezone, as the API returns them. */
const DAY_MS = 86_400_000;

export const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const fmt = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

/** "Monday, 28 September" */
export const longDay = (day: string) => fmt(day, { weekday: 'long', day: 'numeric', month: 'long' });
/** "Mon 28 Sep" */
export const shortDay = (day: string) => fmt(day, { weekday: 'short', day: 'numeric', month: 'short' });

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
