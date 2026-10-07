import type { ClientSession, Types } from 'mongoose';
import {
  StaffAttendance,
  STAFF_ATTENDANCE_STATUSES,
  UNPAID_WEIGHT,
  type StaffAttendanceStatus,
} from '../../models/StaffAttendance';
import { Employee } from '../../models/Employee';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { withTransaction } from '../../utils/transaction';
import { calendarDay, schoolFinanceContext, startOfSchoolToday } from '../../utils/school-time';
import { addDays, daysOff, getAttendanceSettings, isoDay } from '../../services/school-calendar.service';
import type { SaveStaffRegisterInput } from './staff-attendance.validation';

type Counts = Record<StaffAttendanceStatus, number>;
const emptyCounts = (): Counts => Object.fromEntries(STAFF_ATTENDANCE_STATUSES.map((s) => [s, 0])) as Counts;

/** Who is on the register for a day: current staff (on leave included) who had joined by then. */
const onRegister = (day: Date) => ({
  deletedAt: null,
  status: { $in: ['ACTIVE', 'ON_LEAVE'] },
  joiningDate: { $lt: addDays(day, 1) },
});

async function resolveDay(date: string | undefined) {
  const { timezone } = await schoolFinanceContext();
  const today = startOfSchoolToday(timezone);
  const day = date ? calendarDay(date) : today;
  if (Number.isNaN(day.getTime())) throw AppError.badRequest('Invalid date', { field: 'date' });
  if (day > today) throw AppError.badRequest("Attendance can't be taken for a future date", { field: 'date' });
  const off = await daysOff(day, day, await getAttendanceSettings());
  return { day, today, dayOff: off.get(isoDay(day)) ?? null };
}

/** The staff register for one day: everyone on it, with their mark if taken. */
export async function getStaffRegister(date: string | undefined, canMark: boolean) {
  const { day, today, dayOff } = await resolveDay(date);
  const employees = await Employee.find(onRegister(day))
    .sort({ lastName: 1, firstName: 1 })
    .select('firstName lastName employeeNumber designation department status')
    .lean();
  const records = await StaffAttendance.find({ employeeId: { $in: employees.map((e) => e._id) }, date: day, deletedAt: null })
    .populate({ path: 'markedByUserId', select: 'firstName lastName' })
    .lean();
  const recordOf = new Map(records.map((r) => [String(r.employeeId), r]));
  const counts = emptyCounts();
  for (const r of records) counts[r.status] += 1;
  const latest = records.reduce<(typeof records)[number] | null>((a, r) => (!a || r.updatedAt > a.updatedAt ? r : a), null);
  const by = latest?.markedByUserId as unknown as { firstName: string; lastName: string } | null | undefined;

  const readOnlyReason = dayOff
    ? `${dayOff} — no register is taken that day`
    : canMark
      ? null
      : "You can view the staff register, but taking it is the office's job";

  return {
    date: isoDay(day),
    today: isoDay(today),
    dayOff,
    canEdit: readOnlyReason === null,
    readOnlyReason,
    counts,
    marked: records.length,
    lastMarked: latest ? { at: latest.updatedAt, by: by ? `${by.firstName} ${by.lastName}` : null } : null,
    rows: employees.map((e) => {
      const r = recordOf.get(String(e._id));
      return { employee: e, status: r?.status ?? null, remark: r?.remark ?? '' };
    }),
  };
}

/**
 * Saves some or all of a day's staff register, all-or-nothing. Unchanged rows
 * are skipped, and the save is one audit entry with each person's before/after.
 */
export async function saveStaffRegister(input: SaveStaffRegisterInput, actor: ActorMeta) {
  const { day, dayOff } = await resolveDay(input.date);
  if (dayOff) throw AppError.badRequest(`${dayOff} — no register is taken that day`, { field: 'date' });

  const ids = input.entries.map((e) => e.employeeId);
  if (new Set(ids).size !== ids.length) throw AppError.badRequest('A person appears twice in this register', { field: 'entries' });
  const onIt = await Employee.countDocuments({ _id: { $in: ids }, ...onRegister(day) });
  if (onIt !== ids.length) throw AppError.badRequest("One or more people aren't on the staff register for that day", { field: 'entries' });

  await withTransaction(async (session) => {
    const existing = await StaffAttendance.find({ employeeId: { $in: ids }, date: day, deletedAt: null }).session(session).lean();
    const before = new Map(existing.map((r) => [String(r.employeeId), r]));
    const changed: { employeeId: string; before: unknown; after: unknown }[] = [];

    for (const e of input.entries) {
      const prev = before.get(e.employeeId);
      const remark = e.remark ?? '';
      if (prev && prev.status === e.status && (prev.remark ?? '') === remark) continue;
      await StaffAttendance.updateOne(
        { employeeId: e.employeeId, date: day, deletedAt: null },
        { $set: { status: e.status, remark, markedByUserId: actor.actorUserId } },
        { upsert: true, session },
      );
      changed.push({
        employeeId: e.employeeId,
        before: prev ? { status: prev.status, remark: prev.remark ?? '' } : null,
        after: { status: e.status, remark },
      });
    }
    if (changed.length) {
      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'staff.attendance.mark',
        entity: 'StaffAttendance',
        before: changed.map((c) => ({ employeeId: c.employeeId, ...((c.before as object | null) ?? {}) })),
        after: changed.map((c) => ({ employeeId: c.employeeId, ...(c.after as object) })),
        metadata: { date: isoDay(day) },
        ip: actor.ip,
        session,
      });
    }
  });
  return getStaffRegister(input.date, true);
}

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) };
}

/**
 * Unpaid days per employee for a month (Absent and Unpaid leave count 1,
 * Half day ½) — what the payroll draft prefills. Runs in the caller's
 * transaction when given one.
 */
export async function unpaidDaysForMonth(month: string, session?: ClientSession): Promise<Map<string, number>> {
  const { start, end } = monthRange(month);
  const rows = await StaffAttendance.aggregate<{ _id: Types.ObjectId; days: number }>([
    { $match: { date: { $gte: start, $lte: end }, deletedAt: null, status: { $in: ['ABSENT', 'UNPAID_LEAVE', 'HALF_DAY'] } } },
    {
      $group: {
        _id: '$employeeId',
        days: { $sum: { $cond: [{ $eq: ['$status', 'HALF_DAY'] }, UNPAID_WEIGHT.HALF_DAY, 1] } },
      },
    },
  ]).session(session ?? null);
  return new Map(rows.map((r) => [String(r._id), r.days]));
}

/** Present, late and half a half day, over the days a mark was taken; paid leave counts as marked, not present. */
function totalsOf(counts: Counts) {
  const marked = STAFF_ATTENDANCE_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  const present = counts.PRESENT + counts.LATE + counts.HALF_DAY * 0.5;
  return {
    counts,
    marked,
    unpaidDays: STAFF_ATTENDANCE_STATUSES.reduce((sum, s) => sum + counts[s] * UNPAID_WEIGHT[s], 0),
    percentage: marked ? Math.round((present / marked) * 1000) / 10 : null,
  };
}

/**
 * One employee's attendance — their staff profile on the web and the phone: a
 * month day by day (the mark taken, or why there was none), with totals for
 * the month and for its calendar year so far. Days before they joined are
 * flagged so the month doesn't read as a run of missing marks.
 */
export async function getEmployeeAttendance(employeeId: string, month: string | undefined) {
  const employee = await Employee.findOne({ _id: employeeId, deletedAt: null })
    .select('firstName lastName employeeNumber designation joiningDate status')
    .lean();
  if (!employee) throw AppError.notFound('Staff member not found');

  const { timezone } = await schoolFinanceContext();
  const today = startOfSchoolToday(timezone);
  const monthKey = month ?? isoDay(today).slice(0, 7);
  const { start, end } = monthRange(monthKey);
  if (start > today) throw AppError.badRequest("That month hasn't started yet", { field: 'month' });
  const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
  const joined = calendarDay(employee.joiningDate);

  const [off, records, yearRows] = await Promise.all([
    getAttendanceSettings().then((settings) => daysOff(start, end, settings)),
    StaffAttendance.find({ employeeId: employee._id, date: { $gte: start, $lte: end }, deletedAt: null }).select('date status remark').lean(),
    StaffAttendance.aggregate<{ _id: StaffAttendanceStatus; n: number }>([
      { $match: { employeeId: employee._id, date: { $gte: yearStart, $lte: end }, deletedAt: null } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);

  const byDay = new Map(records.map((r) => [isoDay(r.date), r]));
  const monthCounts = emptyCounts();
  const days: {
    date: string;
    weekday: number;
    dayOff: string | null;
    isFuture: boolean;
    beforeJoining: boolean;
    status: StaffAttendanceStatus | null;
    remark: string | null;
  }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const record = byDay.get(isoDay(d));
    if (record) monthCounts[record.status] += 1;
    days.push({
      date: isoDay(d),
      weekday: d.getUTCDay(),
      dayOff: off.get(isoDay(d)) ?? null,
      isFuture: d > today,
      beforeJoining: d < joined,
      status: record?.status ?? null,
      remark: record?.remark || null,
    });
  }
  const yearCounts = emptyCounts();
  for (const row of yearRows) yearCounts[row._id] = row.n;

  return {
    month: monthKey,
    today: isoDay(today),
    employee,
    days,
    /** School days so far this month since they joined — the most marks there could be. */
    schoolDays: days.filter((d) => !d.dayOff && !d.isFuture && !d.beforeJoining).length,
    monthTotals: totalsOf(monthCounts),
    yearTotals: { year: start.getUTCFullYear(), ...totalsOf(yearCounts) },
  };
}

/** Each person's month at a glance: days in each status, unpaid days, and how many school days had a register. */
export async function staffMonthSummary(month: string) {
  const { start, end } = monthRange(month);
  const { timezone } = await schoolFinanceContext();
  const today = startOfSchoolToday(timezone);
  const until = end < today ? end : today;
  const off = until >= start ? await daysOff(start, until, await getAttendanceSettings()) : new Map<string, string>();
  let schoolDays = 0;
  for (let d = start; d <= until; d = addDays(d, 1)) if (!off.has(isoDay(d))) schoolDays += 1;

  const [employees, rows] = await Promise.all([
    Employee.find(onRegister(end)).sort({ lastName: 1, firstName: 1 }).select('firstName lastName employeeNumber designation').lean(),
    StaffAttendance.aggregate<{ _id: { employeeId: Types.ObjectId; status: StaffAttendanceStatus }; n: number }>([
      { $match: { date: { $gte: start, $lte: end }, deletedAt: null } },
      { $group: { _id: { employeeId: '$employeeId', status: '$status' }, n: { $sum: 1 } } },
    ]),
  ]);
  const countsOf = new Map<string, Counts>();
  for (const r of rows) {
    const key = String(r._id.employeeId);
    const counts = countsOf.get(key) ?? emptyCounts();
    counts[r._id.status] += r.n;
    countsOf.set(key, counts);
  }
  return {
    month,
    schoolDays,
    rows: employees.map((e) => {
      const counts = countsOf.get(String(e._id)) ?? emptyCounts();
      const unpaidDays = STAFF_ATTENDANCE_STATUSES.reduce((sum, s) => sum + counts[s] * UNPAID_WEIGHT[s], 0);
      return { employee: e, counts, marked: Object.values(counts).reduce((a, b) => a + b, 0), unpaidDays };
    }),
  };
}
