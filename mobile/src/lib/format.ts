import { DEFAULT_SCHOOL_CURRENCY } from '@sms/shared';

/**
 * Money and numbers, as the web formats them (frontend/src/lib/format.ts).
 * Money is always an integer in the smallest unit (CLAUDE.md), shown in the
 * active school's currency — chosen at registration, set by the session.
 */
let CURRENCY: string = DEFAULT_SCHOOL_CURRENCY;
const LOCALE = 'en';

/** Called by the session whenever the signed-in user (and so the school) changes. */
export function setSchoolCurrency(currency: string | null | undefined): void {
  CURRENCY = currency || DEFAULT_SCHOOL_CURRENCY;
}

export function formatMoney(minor: number, currency = CURRENCY): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
}

/** "$12.9K" — for tight spaces, never for a figure someone reconciles. */
export function formatMoneyCompact(minor: number, currency = CURRENCY): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
}

export const formatNumber = (n: number) => new Intl.NumberFormat(LOCALE).format(n);

/** "28 Sep 2026" for a date or ISO string, in UTC (calendar days are stored at UTC midnight). */
export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', timeZone: undefined } : { timeZone: 'UTC' }),
  }).format(d);
}

/** Major units typed by a person ("1,250.50") → minor units (125050); null if not a valid amount. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (!cleaned || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
