import { useAuthStore } from './auth-store';

/**
 * All money crosses the wire as an integer in the smallest currency unit
 * (CLAUDE.md), so formatting is the only place it becomes a decimal — and
 * parsing is the only place it stops being one. Never store the float.
 */
export function formatMoney(
  minor: number,
  currency = 'USD',
  locale = 'en',
  options: { showSymbol?: boolean } = {},
): string {
  const { showSymbol = true } = options;
  return new Intl.NumberFormat(locale, {
    style: showSymbol ? 'currency' : 'decimal',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** Decimal string from an input → integer minor units. Rounds, never truncates. */
export function toMinorUnits(value: string | number): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromMinorUnits(minor: number): number {
  return minor / 100;
}

/**
 * Dates are stored UTC and rendered in the school's timezone — a roster marked
 * at 08:00 in Karachi must not read as the previous day for an admin whose
 * laptop is in UTC.
 */
export function formatDate(
  iso: string | Date | null | undefined,
  { locale = 'en', timeZone = 'UTC', withTime = false }: { locale?: string; timeZone?: string; withTime?: boolean } = {},
): string {
  if (!iso) return '—';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone,
  }).format(date);
}

export function formatNumber(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatPercent(value: number, locale = 'en', fractionDigits = 1): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * School-aware formatters. Currency/locale/timezone live on the School record;
 * until the school-settings endpoint exposes them on /auth/me we fall back to
 * the same defaults the School schema declares (USD / en / UTC).
 */
export function useSchoolFormat() {
  const user = useAuthStore((s) => s.user);
  const currency = 'USD';
  const locale = 'en';
  const timeZone = 'UTC';

  return {
    currency,
    locale,
    timeZone,
    schoolName: user?.schoolName ?? null,
    money: (minor: number) => formatMoney(minor, currency, locale),
    date: (iso: string | Date | null | undefined, withTime = false) =>
      formatDate(iso, { locale, timeZone, withTime }),
    number: (value: number) => formatNumber(value, locale),
    percent: (value: number, digits?: number) => formatPercent(value, locale, digits),
  };
}
