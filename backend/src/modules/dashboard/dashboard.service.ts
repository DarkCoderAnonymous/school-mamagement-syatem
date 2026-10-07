import { Permission } from '@sms/shared';
import { Student } from '../../models/Student';
import { Teacher } from '../../models/Teacher';
import { Class } from '../../models/Class';
import { Section } from '../../models/Section';
import { Subject } from '../../models/Subject';
import { AcademicSession } from '../../models/AcademicSession';
import type { Types } from 'mongoose';
import { Attendance, ATTENDANCE_STATUSES, type AttendanceStatus } from '../../models/Attendance';
import { StaffAttendance, STAFF_ATTENDANCE_STATUSES, type StaffAttendanceStatus } from '../../models/StaffAttendance';
import { Employee } from '../../models/Employee';
import { schoolFinanceContext, startOfSchoolToday } from '../../utils/school-time';
import { addDays, daysOff, getAttendanceSettings, isoDay } from '../../services/school-calendar.service';
import { getInventorySummary } from '../inventory/inventory.service';
import { feeSummary } from '../fees/fee-reports.service';

const TREND_SCHOOL_DAYS = 14;

/** Today in school time, and whether it's a day off. */
async function schoolToday() {
  const { timezone } = await schoolFinanceContext();
  const today = startOfSchoolToday(timezone);
  const settings = await getAttendanceSettings();
  const from = addDays(today, -40);
  const off = await daysOff(from, today, settings);
  return { today, from, off, dayOff: off.get(isoDay(today)) ?? null };
}

/**
 * Today's student registers across the current session, plus the attendance
 * rate on each of the last school days — present + late over those marked,
 * so a register nobody took doesn't drag the rate down.
 */
async function studentAttendanceToday(sessionId: Types.ObjectId | null) {
  const { today, from, off, dayOff } = await schoolToday();
  const classIds = sessionId ? (await Class.find({ academicSessionId: sessionId, deletedAt: null }).select('_id').lean()).map((c) => c._id) : [];
  const sectionIds = classIds.length ? (await Section.find({ classId: { $in: classIds }, deletedAt: null }).select('_id').lean()).map((x) => x._id) : [];

  const [students, rows, taken] = await Promise.all([
    Student.countDocuments({ sectionId: { $in: sectionIds }, status: 'ACTIVE', deletedAt: null }),
    Attendance.aggregate<{ _id: { date: Date; status: AttendanceStatus }; n: number }>([
      { $match: { date: { $gte: from, $lte: today }, sectionId: { $in: sectionIds }, deletedAt: null } },
      { $group: { _id: { date: '$date', status: '$status' }, n: { $sum: 1 } } },
    ]),
    Attendance.distinct('sectionId', { date: today, sectionId: { $in: sectionIds }, deletedAt: null }),
  ]);

  const byDay = new Map<string, Record<AttendanceStatus, number>>();
  for (const r of rows) {
    const key = isoDay(r._id.date);
    const counts = byDay.get(key) ?? (Object.fromEntries(ATTENDANCE_STATUSES.map((st) => [st, 0])) as Record<AttendanceStatus, number>);
    counts[r._id.status] += r.n;
    byDay.set(key, counts);
  }
  const rateOf = (c?: Record<AttendanceStatus, number>) => {
    const marked = c ? Object.values(c).reduce((a, b) => a + b, 0) : 0;
    return { marked, rate: c && marked ? Math.round(((c.PRESENT + c.LATE) / marked) * 1000) / 10 : null };
  };

  const trend: { date: string; rate: number | null; marked: number }[] = [];
  for (let d = today; d >= from && trend.length < TREND_SCHOOL_DAYS; d = addDays(d, -1)) {
    if (off.has(isoDay(d))) continue;
    trend.unshift({ date: isoDay(d), ...rateOf(byDay.get(isoDay(d))) });
  }
  const counts = byDay.get(isoDay(today)) ?? (Object.fromEntries(ATTENDANCE_STATUSES.map((st) => [st, 0])) as Record<AttendanceStatus, number>);
  return { date: isoDay(today), dayOff, students, sections: sectionIds.length, registersTaken: taken.length, counts, ...rateOf(counts), trend };
}

/** Today's staff register: who's in, out, or on leave, against everyone on it. */
async function staffAttendanceToday() {
  const { today, dayOff } = await schoolToday();
  const [onRegister, rows] = await Promise.all([
    Employee.countDocuments({ deletedAt: null, status: { $in: ['ACTIVE', 'ON_LEAVE'] }, joiningDate: { $lt: addDays(today, 1) } }),
    StaffAttendance.aggregate<{ _id: StaffAttendanceStatus; n: number }>([
      { $match: { date: today, deletedAt: null } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);
  const counts = Object.fromEntries(STAFF_ATTENDANCE_STATUSES.map((st) => [st, 0])) as Record<StaffAttendanceStatus, number>;
  for (const r of rows) counts[r._id] = r.n;
  return { date: isoDay(today), dayOff, onRegister, counts, marked: rows.reduce((a, r) => a + r.n, 0) };
}

/**
 * One request for the dashboard's numbers. Each block is computed only if
 * the caller holds the matching read permission, so the response never
 * carries a figure the user couldn't have fetched from its own screen.
 */
export async function getDashboardSummary(permissions: string[]) {
  const can = (p: Permission) => permissions.includes(p);
  const current = can(Permission.SESSION_READ) || can(Permission.CLASS_READ) || can(Permission.ATTENDANCE_READ)
    ? await AcademicSession.findOne({ isCurrent: true, deletedAt: null }).select('name startDate endDate').lean()
    : null;

  const [students, teachers, academics, inventory, fees, attendance, staffAttendance] = await Promise.all([
    can(Permission.STUDENT_READ)
      ? Promise.all([
          Student.countDocuments({ deletedAt: null, status: 'ACTIVE' }),
          Student.countDocuments({ deletedAt: null, status: 'ACTIVE', gender: 'FEMALE' }),
          Student.countDocuments({ deletedAt: null, status: 'ACTIVE', gender: 'MALE' }),
          Student.countDocuments({
            deletedAt: null,
            admissionDate: { $gte: new Date(Date.now() - 30 * 86_400_000) },
          }),
        ]).then(([active, female, male, admittedLast30Days]) => ({ active, female, male, admittedLast30Days }))
      : null,
    can(Permission.TEACHER_READ) ? Teacher.countDocuments({ deletedAt: null }).then((total) => ({ total })) : null,
    can(Permission.CLASS_READ)
      ? (async () => {
          const classes = current
            ? await Class.find({ academicSessionId: current._id, deletedAt: null }).select('_id').lean()
            : [];
          const [sections, subjects] = await Promise.all([
            classes.length
              ? Section.countDocuments({ classId: { $in: classes.map((c) => c._id) }, deletedAt: null })
              : 0,
            Subject.countDocuments({ deletedAt: null }),
          ]);
          return { classes: classes.length, sections, subjects };
        })()
      : null,
    can(Permission.INVENTORY_READ) ? getInventorySummary() : null,
    can(Permission.FEE_REPORT_READ) ? feeSummary() : null,
    can(Permission.ATTENDANCE_READ) ? studentAttendanceToday(current?._id ?? null) : null,
    can(Permission.STAFF_ATTENDANCE_READ) ? staffAttendanceToday() : null,
  ]);

  return { currentSession: current, students, teachers, academics, inventory, fees, attendance, staffAttendance };
}
