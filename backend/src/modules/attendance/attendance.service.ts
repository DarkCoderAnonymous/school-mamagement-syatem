import type { Types } from 'mongoose';
import { Attendance, ATTENDANCE_STATUSES, type AttendanceStatus } from '../../models/Attendance';
import { AcademicSession } from '../../models/AcademicSession';
import { Class } from '../../models/Class';
import { Section } from '../../models/Section';
import { Student } from '../../models/Student';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { withTransaction } from '../../utils/transaction';
import { calendarDay, localDateString, schoolFinanceContext, startOfSchoolToday } from '../../utils/school-time';
import { markableSectionIds } from '../../services/teaching-scope.service';
import {
  addDays,
  CALENDAR_LOOKBACK_DAYS,
  daysOff,
  MAX_ATTENDANCE_HISTORY_DAYS,
  earliestTeacherDay,
  getAttendanceSettings,
  isoDay,
} from '../../services/school-calendar.service';
import { getCurrentAcademicSession } from '../academic-sessions/academic-sessions.service';
import type { SaveRegisterInput } from './attendance.validation';

/**
 * Who may mark which register. `attendance.mark` gets you in; a teacher may
 * then mark sections they're class teacher of or hold a teaching assignment
 * in, for today and the school's catch-up window of school days before it
 * (a teacher back from leave takes the registers they missed).
 * `attendance.manage` (the office) may mark or correct any section on any day
 * of its session. Nobody marks a day off (weekly off day or holiday). Built by the controller
 * from the token — services never see the request.
 */
export interface AttendanceViewer {
  userId: string;
  canMark: boolean;
  canManage: boolean;
}

type Counts = Record<AttendanceStatus, number>;
const emptyCounts = (): Counts => Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, 0])) as Counts;

/**
 * The requested calendar day and the school's today (both UTC midnight),
 * the days off around them, and how far back a teacher may still reach.
 */
async function resolveDay(date: string | undefined) {
  const { timezone } = await schoolFinanceContext();
  const today = startOfSchoolToday(timezone);
  const day = date ? calendarDay(date) : today;
  if (Number.isNaN(day.getTime())) throw AppError.badRequest('Invalid date', { field: 'date' });
  if (day > today) throw AppError.badRequest("Attendance can't be taken for a future date", { field: 'date' });
  // Real history is at most a few sessions old; anything older (0001-01-01)
  // only makes the calendar below walk hundreds of thousands of days.
  if (day < addDays(today, -MAX_ATTENDANCE_HISTORY_DAYS)) {
    throw AppError.badRequest('That date is too far in the past', { field: 'date' });
  }

  const settings = await getAttendanceSettings();
  const lookback = addDays(today, -CALENDAR_LOOKBACK_DAYS);
  const off = await daysOff(day < lookback ? day : lookback, today, settings);
  const earliest = earliestTeacherDay(today, settings.teacherBackdateDays, off);
  return { day, today, timezone, settings, off, earliest, dayOff: off.get(isoDay(day)) ?? null };
}
type DayContext = Awaited<ReturnType<typeof resolveDay>>;

/**
 * Why this viewer can't mark this section on this day, or null if they can.
 * One function so the register's `canEdit` and the save guard never disagree.
 */
async function markBlocker(
  viewer: AttendanceViewer,
  sectionId: string,
  ctx: DayContext,
  markable?: Set<string>,
): Promise<string | null> {
  if (ctx.dayOff) return `${ctx.dayOff} — no register is taken that day`;
  if (viewer.canManage) return null;
  if (!viewer.canMark) return "You don't have permission to take attendance";
  const allowed = markable ?? (await markableSectionIds(viewer.userId));
  if (!allowed.has(sectionId)) return "You're not this section's class teacher or one of its teachers";
  if (ctx.day < ctx.earliest) {
    const n = ctx.settings.teacherBackdateDays;
    return n === 0
      ? "Only today's register can be taken — ask the office to take or correct an earlier day"
      : `Teachers can take registers up to ${n} school day${n === 1 ? '' : 's'} back — ask the office to take or correct this one`;
  }
  return null;
}

async function sectionContext(sectionId: string) {
  const section = await Section.findOne({ _id: sectionId, deletedAt: null })
    .populate({ path: 'classTeacherId', select: 'employeeId', populate: { path: 'employeeId', select: 'firstName lastName' } })
    .lean();
  if (!section) throw AppError.notFound('Section not found');
  const cls = await Class.findOne({ _id: section.classId, deletedAt: null }).select('name academicSessionId').lean();
  if (!cls) throw AppError.notFound('Section not found');
  const session = await AcademicSession.findOne({ _id: cls.academicSessionId, deletedAt: null }).select('name startDate endDate').lean();
  if (!session) throw AppError.notFound('Section not found');
  const teacher = section.classTeacherId as unknown as { employeeId?: { firstName: string; lastName: string } } | null;
  return {
    section,
    cls,
    session,
    classTeacher: teacher?.employeeId ? `${teacher.employeeId.firstName} ${teacher.employeeId.lastName}` : null,
  };
}

/**
 * The day's board: every section of the current session with its strength
 * and how far its register has got. `mine` narrows to the sections the
 * viewer teaches — a teacher's landing view.
 */
export async function getBoard(query: { date?: string; mine?: string }, viewer: AttendanceViewer) {
  const ctx = await resolveDay(query.date);
  const { day, today, timezone } = ctx;
  const current = await getCurrentAcademicSession();
  const base = {
    date: localDateString(day, 'UTC'),
    today: localDateString(today, 'UTC'),
    timezone,
    dayOff: ctx.dayOff,
    /** The earliest day this viewer may take a register for; null for the office (any day). */
    earliestEditable: viewer.canManage ? null : isoDay(ctx.earliest),
  };
  if (!current) return { ...base, sections: [], missed: [] };

  const classes = await Class.find({ academicSessionId: current._id, deletedAt: null }).sort({ order: 1, name: 1 }).select('name order').lean();
  const markable = await markableSectionIds(viewer.userId);
  const sectionFilter: Record<string, unknown> = { classId: { $in: classes.map((c) => c._id) }, deletedAt: null };
  if (query.mine === 'true') sectionFilter._id = { $in: [...markable] };
  const sections = await Section.find(sectionFilter).sort({ name: 1 }).select('name classId').lean();
  const sectionIds = sections.map((s) => s._id);

  const [strength, marked] = await Promise.all([
    Student.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { sectionId: { $in: sectionIds }, status: 'ACTIVE', deletedAt: null } },
      { $group: { _id: '$sectionId', n: { $sum: 1 } } },
    ]),
    Attendance.aggregate<{ _id: { sectionId: Types.ObjectId; status: AttendanceStatus }; n: number }>([
      { $match: { date: day, sectionId: { $in: sectionIds }, deletedAt: null } },
      { $group: { _id: { sectionId: '$sectionId', status: '$status' }, n: { $sum: 1 } } },
    ]),
  ]);
  const strengthOf = new Map(strength.map((s) => [String(s._id), s.n]));
  const countsOf = new Map<string, Counts>();
  for (const m of marked) {
    const key = String(m._id.sectionId);
    const counts = countsOf.get(key) ?? emptyCounts();
    counts[m._id.status] += m.n;
    countsOf.set(key, counts);
  }
  const classOf = new Map(classes.map((c) => [String(c._id), c]));
  const order = new Map(classes.map((c, i) => [String(c._id), i]));

  const rows = await Promise.all(
    sections
      .sort((a, b) => (order.get(String(a.classId)) ?? 0) - (order.get(String(b.classId)) ?? 0) || a.name.localeCompare(b.name))
      .map(async (s) => {
        const counts = countsOf.get(String(s._id)) ?? emptyCounts();
        const cls = classOf.get(String(s.classId))!;
        return {
          _id: s._id,
          name: s.name,
          class: { _id: cls._id, name: cls.name },
          students: strengthOf.get(String(s._id)) ?? 0,
          marked: Object.values(counts).reduce((a, b) => a + b, 0),
          counts,
          isMine: markable.has(String(s._id)),
          canMark: (await markBlocker(viewer, String(s._id), ctx, markable)) === null,
        };
      }),
  );
  return { ...base, sections: rows, missed: await missedRegisters(ctx, markable) };
}

/**
 * Registers the viewer can still take but hasn't finished, on the school days
 * of their catch-up window before today — what a teacher back from leave
 * needs to fill in. Only their own sections, so the office's list stays empty.
 */
async function missedRegisters(ctx: DayContext, markable: Set<string>) {
  const days: Date[] = [];
  for (let d = ctx.earliest; d < ctx.today; d = addDays(d, 1)) if (!ctx.off.has(isoDay(d))) days.push(d);
  if (days.length === 0 || markable.size === 0) return [];

  const sections = await Section.find({ _id: { $in: [...markable] }, deletedAt: null })
    .populate({ path: 'classId', select: 'name order academicSessionId' })
    .select('name classId')
    .lean();
  const ids = sections.map((s) => s._id);
  const [strength, marked] = await Promise.all([
    Student.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { sectionId: { $in: ids }, status: 'ACTIVE', deletedAt: null } },
      { $group: { _id: '$sectionId', n: { $sum: 1 } } },
    ]),
    Attendance.aggregate<{ _id: { sectionId: Types.ObjectId; date: Date }; n: number }>([
      { $match: { sectionId: { $in: ids }, date: { $in: days }, deletedAt: null } },
      { $group: { _id: { sectionId: '$sectionId', date: '$date' }, n: { $sum: 1 } } },
    ]),
  ]);
  const strengthOf = new Map(strength.map((s) => [String(s._id), s.n]));
  const markedOf = new Map(marked.map((m) => [`${m._id.sectionId}:${isoDay(m._id.date)}`, m.n]));

  const missed: { date: string; section: { _id: unknown; name: string }; class: { _id: unknown; name: string }; marked: number; students: number }[] = [];
  for (const day of days) {
    for (const s of sections) {
      const cls = s.classId as unknown as { _id: unknown; name: string; order?: number } | null;
      const students = strengthOf.get(String(s._id)) ?? 0;
      const done = markedOf.get(`${s._id}:${isoDay(day)}`) ?? 0;
      if (cls && students > 0 && done < students) {
        missed.push({ date: isoDay(day), section: { _id: s._id, name: s.name }, class: { _id: cls._id, name: cls.name }, marked: done, students });
      }
    }
  }
  return missed.sort((a, b) => a.date.localeCompare(b.date) || a.class.name.localeCompare(b.class.name) || a.section.name.localeCompare(b.section.name));
}

const byRoll = (a: { rollNumber?: string; firstName: string }, b: { rollNumber?: string; firstName: string }) =>
  (a.rollNumber ?? '').localeCompare(b.rollNumber ?? '', undefined, { numeric: true }) || a.firstName.localeCompare(b.firstName);

/** One section's register for one day: every active student with their mark, if taken. */
export async function getRegister(sectionId: string, date: string | undefined, viewer: AttendanceViewer) {
  const ctx = await resolveDay(date);
  const { day, today } = ctx;
  const { section, cls, classTeacher } = await sectionContext(sectionId);
  const students = await Student.find({ sectionId: section._id, status: 'ACTIVE', deletedAt: null })
    .select('firstName lastName admissionNumber rollNumber')
    .lean();
  const records = await Attendance.find({ studentId: { $in: students.map((s) => s._id) }, date: day, deletedAt: null })
    .populate({ path: 'markedByUserId', select: 'firstName lastName' })
    .lean();
  const recordOf = new Map(records.map((r) => [String(r.studentId), r]));
  const counts = emptyCounts();
  for (const r of records) counts[r.status] += 1;
  const latest = records.reduce<(typeof records)[number] | null>((a, r) => (!a || r.updatedAt > a.updatedAt ? r : a), null);
  const markedBy = latest?.markedByUserId as unknown as { firstName: string; lastName: string } | null | undefined;
  const blocker = await markBlocker(viewer, String(section._id), ctx);

  return {
    date: localDateString(day, 'UTC'),
    today: localDateString(today, 'UTC'),
    dayOff: ctx.dayOff,
    earliestEditable: viewer.canManage ? null : isoDay(ctx.earliest),
    section: { _id: section._id, name: section.name },
    class: { _id: cls._id, name: cls.name },
    classTeacher,
    canEdit: blocker === null,
    readOnlyReason: blocker,
    counts,
    marked: records.length,
    lastMarked: latest ? { at: latest.updatedAt, by: markedBy ? `${markedBy.firstName} ${markedBy.lastName}` : null } : null,
    rows: students.sort(byRoll).map((s) => {
      const r = recordOf.get(String(s._id));
      return { student: s, status: r?.status ?? null, remark: r?.remark ?? '' };
    }),
  };
}

/**
 * Saves some or all of a section's register for a day, all-or-nothing.
 * Rows that didn't change are skipped, and the whole save is one audit entry
 * with each student's before/after. The class/section/session stored are the
 * student's placement on that day (they must be in this section now).
 */
export async function saveRegister(input: SaveRegisterInput, viewer: AttendanceViewer, actor: ActorMeta) {
  const ctx = await resolveDay(input.date);
  const { day } = ctx;
  const { section, cls, session } = await sectionContext(input.sectionId);
  if (day < calendarDay(session.startDate) || day > calendarDay(session.endDate)) {
    throw AppError.badRequest(`That date is outside ${session.name}`, { field: 'date' });
  }
  if (ctx.dayOff) throw AppError.badRequest(`${ctx.dayOff} — no register is taken that day`, { field: 'date' });
  const blocker = await markBlocker(viewer, String(section._id), ctx);
  if (blocker) throw AppError.forbidden(blocker);

  const ids = input.entries.map((e) => e.studentId);
  if (new Set(ids).size !== ids.length) throw AppError.badRequest('A student appears twice in this register', { field: 'entries' });
  const inSection = await Student.countDocuments({ _id: { $in: ids }, sectionId: section._id, status: 'ACTIVE', deletedAt: null });
  if (inSection !== ids.length) throw AppError.badRequest("One or more students aren't in this section", { field: 'entries' });

  await withTransaction(async (txn) => {
    const existing = await Attendance.find({ studentId: { $in: ids }, date: day, deletedAt: null }).session(txn).lean();
    const before = new Map(existing.map((r) => [String(r.studentId), r]));
    const changed: { studentId: string; before: unknown; after: unknown }[] = [];

    for (const e of input.entries) {
      const prev = before.get(e.studentId);
      const remark = e.remark ?? '';
      if (prev && prev.status === e.status && (prev.remark ?? '') === remark) continue;
      await Attendance.updateOne(
        { studentId: e.studentId, date: day, deletedAt: null },
        {
          $set: {
            status: e.status,
            remark,
            markedByUserId: actor.actorUserId,
            sectionId: section._id,
            classId: cls._id,
            academicSessionId: cls.academicSessionId,
          },
        },
        { upsert: true, session: txn },
      );
      changed.push({
        studentId: e.studentId,
        before: prev ? { status: prev.status, remark: prev.remark ?? '' } : null,
        after: { status: e.status, remark },
      });
    }

    if (changed.length) {
      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'attendance.mark',
        entity: 'Section',
        entityId: section._id,
        before: changed.map((c) => ({ studentId: c.studentId, ...((c.before as object | null) ?? {}) })),
        after: changed.map((c) => ({ studentId: c.studentId, ...(c.after as object) })),
        metadata: { date: localDateString(day, 'UTC') },
        ip: actor.ip,
        session: txn,
      });
    }
  });

  return getRegister(String(section._id), input.date, viewer);
}

/**
 * A section's register for a whole month — the paper register's grid:
 * every student down the side, every day across, each cell the mark taken.
 * Students who left or moved section mid-month stay on it for the days they
 * were marked here (rows snapshot the section). Attendance % is present +
 * late over the days a mark was taken, so a day nobody took the register
 * doesn't count against anyone.
 */
export async function getMonthlyRegister(sectionId: string, month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const { timezone } = await schoolFinanceContext();
  const today = startOfSchoolToday(timezone);
  if (start > today) throw AppError.badRequest("That month hasn't started yet", { field: 'month' });

  const { section, cls, classTeacher } = await sectionContext(sectionId);
  const off = await daysOff(start, end, await getAttendanceSettings());

  const records = await Attendance.find({ sectionId: section._id, date: { $gte: start, $lte: end }, deletedAt: null })
    .select('studentId date status remark')
    .lean();
  const studentIds = new Set(records.map((r) => String(r.studentId)));
  const students = await Student.find({
    deletedAt: null,
    $or: [{ sectionId: section._id, status: 'ACTIVE' }, { _id: { $in: [...studentIds] } }],
  })
    .select('firstName lastName admissionNumber rollNumber sectionId status')
    .lean();

  const days: { date: string; weekday: number; dayOff: string | null; isFuture: boolean; counts: Counts }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days.push({ date: isoDay(d), weekday: d.getUTCDay(), dayOff: off.get(isoDay(d)) ?? null, isFuture: d > today, counts: emptyCounts() });
  }
  const dayOf = new Map(days.map((d) => [d.date, d]));

  const marksOf = new Map<string, Record<string, AttendanceStatus>>();
  for (const r of records) {
    const key = String(r.studentId);
    const marks = marksOf.get(key) ?? {};
    marks[isoDay(r.date)] = r.status;
    marksOf.set(key, marks);
    const day = dayOf.get(isoDay(r.date));
    if (day) day.counts[r.status] += 1;
  }

  const rows = students.sort(byRoll).map((s) => {
    const marks = marksOf.get(String(s._id)) ?? {};
    const counts = emptyCounts();
    for (const status of Object.values(marks)) counts[status] += 1;
    const marked = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      student: s,
      /** Still in this section now; false for someone who moved or left during the month. */
      current: String(s.sectionId) === String(section._id) && s.status === 'ACTIVE',
      marks,
      counts,
      marked,
      percentage: marked ? Math.round(((counts.PRESENT + counts.LATE) / marked) * 1000) / 10 : null,
    };
  });

  const schoolDays = days.filter((d) => !d.dayOff && !d.isFuture).length;
  return {
    month,
    section: { _id: section._id, name: section.name },
    class: { _id: cls._id, name: cls.name },
    classTeacher,
    schoolDays,
    /** School days so far with at least one mark — how many registers were actually taken. */
    registersTaken: days.filter((d) => Object.values(d.counts).some((n) => n > 0)).length,
    days,
    rows,
  };
}

const totalsOf = (counts: Counts) => {
  const marked = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, marked, percentage: marked ? Math.round(((counts.PRESENT + counts.LATE) / marked) * 1000) / 10 : null };
};

/**
 * One student's attendance — their record page and the phone's student
 * screen: a month day by day (the mark taken, or why there was none), with
 * totals for the month and for their current session. Same % rule as the
 * monthly register: present + late over the days a mark was taken.
 */
export async function getStudentAttendance(studentId: string, month: string | undefined) {
  const { timezone } = await schoolFinanceContext();
  const today = startOfSchoolToday(timezone);
  const monthKey = month ?? isoDay(today).slice(0, 7);
  const [y, m] = monthKey.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  if (start > today) throw AppError.badRequest("That month hasn't started yet", { field: 'month' });

  const student = await Student.findOne({ _id: studentId, deletedAt: null }).select('firstName lastName academicSessionId').lean();
  if (!student) throw AppError.notFound('Student not found');

  const [off, records, sessionRows] = await Promise.all([
    getAttendanceSettings().then((settings) => daysOff(start, end, settings)),
    Attendance.find({ studentId: student._id, date: { $gte: start, $lte: end }, deletedAt: null }).select('date status remark').lean(),
    Attendance.aggregate<{ _id: AttendanceStatus; n: number }>([
      { $match: { studentId: student._id, academicSessionId: student.academicSessionId, deletedAt: null } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);

  const byDay = new Map(records.map((r) => [isoDay(r.date), r]));
  const monthCounts = emptyCounts();
  const days: { date: string; weekday: number; dayOff: string | null; isFuture: boolean; status: AttendanceStatus | null; remark: string | null }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const record = byDay.get(isoDay(d));
    if (record) monthCounts[record.status] += 1;
    days.push({
      date: isoDay(d),
      weekday: d.getUTCDay(),
      dayOff: off.get(isoDay(d)) ?? null,
      isFuture: d > today,
      status: record?.status ?? null,
      remark: record?.remark ?? null,
    });
  }
  const sessionCounts = emptyCounts();
  for (const row of sessionRows) sessionCounts[row._id] = row.n;

  return {
    month: monthKey,
    today: isoDay(today),
    student: { _id: student._id, firstName: student.firstName, lastName: student.lastName },
    days,
    /** School days so far this month — the most marks there could be. */
    schoolDays: days.filter((d) => !d.dayOff && !d.isFuture).length,
    monthTotals: totalsOf(monthCounts),
    sessionTotals: totalsOf(sessionCounts),
  };
}
