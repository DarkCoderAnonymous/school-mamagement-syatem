import { Holiday } from '../models/Holiday';
import { School } from '../models/School';
import { AppError } from '../utils/AppError';
import { recordAudit } from '../utils/audit';
import type { ActorMeta } from '../utils/actor';
import { TenantContext } from '../tenant/context';

/**
 * Which days are school days. A day is off when it falls on one of the
 * school's weekly days off, or inside a Holiday. Registers are neither
 * expected nor accepted on days off, and they don't count towards a
 * teacher's catch-up window.
 */

export interface AttendanceSettings {
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOffDays: number[];
  /** School days before today a teacher may still take a register for. */
  teacherBackdateDays: number;
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = { weeklyOffDays: [0], teacherBackdateDays: 2 };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MS = 86_400_000;
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const schoolId = TenantContext.getSchoolId();
  if (!schoolId) throw AppError.forbidden('No school context');
  const school = await School.findById(schoolId).select('attendanceSettings').lean();
  const saved = school?.attendanceSettings;
  return {
    weeklyOffDays: saved?.weeklyOffDays ?? DEFAULT_ATTENDANCE_SETTINGS.weeklyOffDays,
    teacherBackdateDays: saved?.teacherBackdateDays ?? DEFAULT_ATTENDANCE_SETTINGS.teacherBackdateDays,
  };
}

export async function updateAttendanceSettings(input: Partial<AttendanceSettings>, actor: ActorMeta) {
  const before = await getAttendanceSettings();
  const next: AttendanceSettings = {
    weeklyOffDays: [...new Set(input.weeklyOffDays ?? before.weeklyOffDays)].sort(),
    teacherBackdateDays: input.teacherBackdateDays ?? before.teacherBackdateDays,
  };
  // School is a platform document, addressed by the caller's own schoolId from the token.
  await School.updateOne({ _id: actor.schoolId }, { $set: { attendanceSettings: next } });
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'attendance.settings.update',
    entity: 'School',
    entityId: actor.schoolId,
    before,
    after: next,
    ip: actor.ip,
  });
  return next;
}

/**
 * How far back attendance can be looked up — ten years, well beyond any
 * session a school still works with, and cheap to walk day by day.
 */
export const MAX_ATTENDANCE_HISTORY_DAYS = 3660;

/** Every day off from `from` to `to` inclusive, as "YYYY-MM-DD" → why. A holiday's name wins over "Sunday". */
export async function daysOff(from: Date, to: Date, settings: AttendanceSettings): Promise<Map<string, string>> {
  // The loop below is synchronous, one pass per calendar day: an unbounded
  // range (a date of 0001-01-01 is ~740k days) would stall the event loop the
  // whole platform shares. Callers bound their input; this is the backstop.
  if (to.getTime() - from.getTime() > MAX_ATTENDANCE_HISTORY_DAYS * DAY_MS) {
    throw AppError.badRequest('That date range is too long', { field: 'date' });
  }
  const off = new Map<string, string>();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const day = new Date(t);
    if (settings.weeklyOffDays.includes(day.getUTCDay())) off.set(isoDay(day), `${WEEKDAYS[day.getUTCDay()]} is a day off`);
  }
  const holidays = await Holiday.find({ deletedAt: null, startDate: { $lte: to }, endDate: { $gte: from } })
    .select('name startDate endDate')
    .lean();
  for (const h of holidays) {
    const start = Math.max(h.startDate.getTime(), from.getTime());
    const end = Math.min(h.endDate.getTime(), to.getTime());
    for (let t = start; t <= end; t += DAY_MS) off.set(isoDay(new Date(t)), h.name);
  }
  return off;
}

/**
 * The earliest day a teacher may still take a register: today plus the
 * `backdate` school days before it. Days off are skipped, so a teacher back
 * on Monday from Thursday–Friday leave can still take both, weekend or not.
 */
export function earliestTeacherDay(today: Date, backdate: number, off: Map<string, string>): Date {
  let day = today;
  for (let counted = 0, guard = 0; counted < backdate && guard < 60; guard += 1) {
    day = new Date(day.getTime() - DAY_MS);
    if (!off.has(isoDay(day))) counted += 1;
  }
  return day;
}

/** The window of days `earliestTeacherDay` might reach back over: enough for any holiday run. */
export const CALENDAR_LOOKBACK_DAYS = 60;
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
