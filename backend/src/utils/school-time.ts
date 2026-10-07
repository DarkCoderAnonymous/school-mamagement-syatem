import { School, type FeeSettings } from '../models/School';
import { TenantContext } from '../tenant/context';
import { AppError } from './AppError';

/**
 * Calendar logic in the SCHOOL's timezone (CLAUDE.md: dates stored UTC,
 * business-day logic in the school's zone). A due date is a calendar day,
 * stored as UTC midnight of that day; "today" is computed in the school's
 * zone, so a Karachi school's invoice becomes overdue at Karachi midnight,
 * not at UTC midnight.
 */

export const DEFAULT_FEE_SETTINGS: FeeSettings = {
  lateFineType: 'NONE',
  lateFineAmountMinor: 0,
  graceDays: 0,
  maxFineMinor: 0,
  invoicePrefix: 'INV',
  receiptPrefix: 'RCPT',
};

export interface SchoolFinanceContext {
  schoolId: string;
  name: string;
  timezone: string;
  currency: string;
  feeSettings: FeeSettings;
}

/** The acting school's money/time settings. School is a platform collection, so it's read by id. */
export async function schoolFinanceContext(): Promise<SchoolFinanceContext> {
  const schoolId = TenantContext.getSchoolId();
  if (!schoolId) throw AppError.forbidden('No school context');
  const school = await School.findById(schoolId).select('name timezone currency feeSettings').lean();
  if (!school) throw AppError.notFound('School not found');
  return {
    schoolId,
    name: school.name,
    timezone: school.timezone || 'UTC',
    currency: school.currency || 'USD',
    feeSettings: { ...DEFAULT_FEE_SETTINGS, ...(school.feeSettings ?? {}) },
  };
}

/** "YYYY-MM-DD" for `date` as seen in `timeZone`. */
export function localDateString(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** UTC midnight of the school's current calendar day — due dates before this are overdue. */
export function startOfSchoolToday(timeZone: string, now = new Date()): Date {
  return new Date(`${localDateString(now, timeZone)}T00:00:00.000Z`);
}

/** Whole days from `earlier` to `later`, both calendar-day dates at UTC midnight. */
export function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

/** A calendar day as UTC midnight, from "YYYY-MM-DD" or a Date. */
export function calendarDay(value: Date | string): Date {
  const iso = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * The real instant a calendar day ("YYYY-MM-DD") starts in `timeZone` — for
 * comparing against timestamps like payment times. (Due dates are calendar
 * days stored at UTC midnight and use `startOfSchoolToday` instead.)
 */
export function zonedDayStart(day: string, timeZone: string): Date {
  const probe = new Date(`${day}T12:00:00.000Z`);
  const offset =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(probe)
      .find((p) => p.type === 'timeZoneName')
      ?.value.replace('GMT', '') || '+00:00';
  return new Date(`${day}T00:00:00${offset === '' ? '+00:00' : offset}`);
}
