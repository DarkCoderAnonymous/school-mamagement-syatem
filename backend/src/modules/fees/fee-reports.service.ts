import { Types } from 'mongoose';
import { FeeInvoice } from '../../models/FeeInvoice';
import { FeePayment } from '../../models/FeePayment';
import { Student } from '../../models/Student';
import { AcademicSession } from '../../models/AcademicSession';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { buildPaginationMeta } from '../../utils/response';
import { searchRegex } from '../../utils/query';
import { localDateString, schoolFinanceContext, startOfSchoolToday, zonedDayStart } from '../../utils/school-time';
import { enqueueMail } from '../../jobs/mailer.queue';
import { OPEN_STATUSES } from './invoices.service';

/** How long a family is left alone after a fee reminder. */
export const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface DefaulterRow {
  _id: Types.ObjectId;
  overdueMinor: number;
  invoiceCount: number;
  oldestDueDate: Date;
}

function overdueMatch(todayStart: Date, classId?: string): Record<string, unknown> {
  return {
    deletedAt: null,
    cancelledAt: null,
    status: { $in: OPEN_STATUSES },
    dueDate: { $lt: todayStart },
    ...(classId ? { classId: new Types.ObjectId(classId) } : {}),
  };
}

/**
 * Students with money overdue, largest first. Aggregated per student (a family
 * three months behind is one row, not three), then joined to the student and
 * their primary contact for the "call them" list. The tenant plugin prepends
 * the schoolId $match to the pipeline.
 */
export async function listDefaulters(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const ctx = await schoolFinanceContext();
  const todayStart = startOfSchoolToday(ctx.timezone);
  const classId = typeof query.classId === 'string' ? query.classId : undefined;
  const match = overdueMatch(todayStart, classId);
  if (search) {
    const rx = searchRegex(search);
    const students = await Student.find({ deletedAt: null, $or: [{ firstName: rx }, { lastName: rx }, { admissionNumber: rx }] })
      .select('_id')
      .limit(500)
      .lean();
    match.studentId = { $in: students.map((s) => s._id) };
  }

  const [result] = await FeeInvoice.aggregate<{ rows: DefaulterRow[]; total: { n: number; overdueMinor: number }[] }>([
    { $match: match },
    {
      $group: {
        _id: '$studentId',
        overdueMinor: { $sum: { $subtract: ['$totalMinor', '$paidMinor'] } },
        invoiceCount: { $sum: 1 },
        oldestDueDate: { $min: '$dueDate' },
      },
    },
    { $match: { overdueMinor: { $gt: 0 } } },
    { $sort: { overdueMinor: -1, _id: 1 } },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: limit }],
        total: [{ $group: { _id: null, n: { $sum: 1 }, overdueMinor: { $sum: '$overdueMinor' } } }],
      },
    },
  ]);

  const rows = result?.rows ?? [];
  const students = await Student.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('firstName lastName admissionNumber classId sectionId guardians schoolId')
    .populate([
      { path: 'classId', select: 'name' },
      { path: 'sectionId', select: 'name' },
      { path: 'guardians.guardianId', select: 'firstName lastName phone email' },
    ])
    .lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));

  const items = rows.map((r) => {
    const student = byId.get(String(r._id));
    const primary = student?.guardians.find((g) => g.isPrimary) ?? student?.guardians[0];
    return {
      _id: String(r._id),
      schoolId: ctx.schoolId,
      student: student
        ? { _id: student._id, firstName: student.firstName, lastName: student.lastName, admissionNumber: student.admissionNumber, classId: student.classId, sectionId: student.sectionId }
        : null,
      primaryContact: primary?.guardianId ?? null,
      overdueMinor: r.overdueMinor,
      invoiceCount: r.invoiceCount,
      oldestDueDate: r.oldestDueDate,
      daysOverdue: Math.floor((todayStart.getTime() - new Date(r.oldestDueDate).getTime()) / 86_400_000),
    };
  });

  const totals = result?.total[0];
  return {
    items,
    meta: buildPaginationMeta(page, limit, totals?.n ?? 0),
    totalOverdueMinor: totals?.overdueMinor ?? 0,
  };
}

/**
 * Emails each defaulter's primary guardian (those with an email on file). By
 * default everyone overdue; or just the students picked on screen. Delivery is
 * the mail queue's job — this records who was reminded and when.
 */
export async function sendReminders(studentIds: string[] | undefined, actor: ActorMeta) {
  const ctx = await schoolFinanceContext();
  const todayStart = startOfSchoolToday(ctx.timezone);
  const match = overdueMatch(todayStart);
  if (studentIds?.length) match.studentId = { $in: studentIds.map((id) => new Types.ObjectId(id)) };

  // A family reminded in the last day isn't reminded again: without this a
  // repeated click (or a script) re-sent up to 1000 emails every time.
  // `lastReminderAt` is stamped on every overdue invoice of a reminded
  // student, so the newest stamp across them is when the family last heard.
  const cooldownCutoff = new Date(Date.now() - REMINDER_COOLDOWN_MS);
  const [split] = await FeeInvoice.aggregate<{ due: DefaulterRow[]; recent: { n: number }[] }>([
    { $match: match },
    { $group: { _id: '$studentId', overdueMinor: { $sum: { $subtract: ['$totalMinor', '$paidMinor'] } }, invoiceCount: { $sum: 1 }, oldestDueDate: { $min: '$dueDate' }, lastReminderAt: { $max: '$lastReminderAt' } } },
    { $match: { overdueMinor: { $gt: 0 } } },
    {
      $facet: {
        due: [{ $match: { $or: [{ lastReminderAt: null }, { lastReminderAt: { $lt: cooldownCutoff } }] } }, { $limit: 1000 }],
        recent: [{ $match: { lastReminderAt: { $gte: cooldownCutoff } } }, { $count: 'n' }],
      },
    },
  ]);
  const rows = split?.due ?? [];
  const skippedRecentlyReminded = split?.recent[0]?.n ?? 0;
  if (rows.length === 0) {
    throw AppError.badRequest(
      skippedRecentlyReminded > 0
        ? 'Everyone overdue was already reminded in the last 24 hours'
        : 'No overdue fees to remind anyone about',
    );
  }

  const students = await Student.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('firstName lastName guardians')
    .populate({ path: 'guardians.guardianId', select: 'firstName lastName email' })
    .lean();
  const money = new Intl.NumberFormat('en', { style: 'currency', currency: ctx.currency });

  let sent = 0;
  const skipped: string[] = [];
  const reminded: Types.ObjectId[] = [];
  for (const row of rows) {
    const student = students.find((s) => String(s._id) === String(row._id));
    const link = student?.guardians.find((g) => g.isPrimary) ?? student?.guardians[0];
    const guardian = link?.guardianId as unknown as { firstName: string; email?: string } | null;
    if (!student || !guardian?.email) {
      if (student) skipped.push(`${student.firstName} ${student.lastName}`);
      continue;
    }
    await enqueueMail({
      to: guardian.email,
      subject: `Fee reminder — ${student.firstName} ${student.lastName}`,
      body:
        `Dear ${guardian.firstName}, ${student.firstName}'s school fees of ${money.format(row.overdueMinor / 100)} ` +
        `(${row.invoiceCount} invoice${row.invoiceCount === 1 ? '' : 's'}) are overdue. Please pay at the school office ` +
        `or contact ${ctx.name} if you've already paid.`,
    });
    reminded.push(row._id);
    sent += 1;
  }

  if (reminded.length) {
    await FeeInvoice.updateMany({ ...match, studentId: { $in: reminded } }, { $set: { lastReminderAt: new Date() } });
  }
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'fee.reminder.send',
    entity: 'FeeInvoice',
    after: { sent, skippedNoEmail: skipped.length, skippedRecentlyReminded },
    ip: actor.ip,
  });
  return { sent, skippedNoEmail: skipped.length, skippedStudents: skipped.slice(0, 20), skippedRecentlyReminded };
}

/**
 * Money actually collected in a period, net of refunds, grouped by method and
 * by day in the school's timezone — the daily cash-up report. Reversed
 * payments are excluded entirely; refunds are subtracted.
 */
export async function collectionsReport(from: Date, to: Date) {
  const ctx = await schoolFinanceContext();
  if (to < from) throw AppError.badRequest('The end date is before the start date', { field: 'to' });
  // `from`/`to` are calendar days; the range covers both whole days in the SCHOOL's zone.
  const start = zonedDayStart(localDateString(from, 'UTC'), ctx.timezone);
  const endDay = localDateString(new Date(to.getTime() + 86_400_000), 'UTC');
  const end = zonedDayStart(endDay, ctx.timezone);
  const match = { deletedAt: null, status: 'COMPLETED', paidAt: { $gte: start, $lt: end } };

  const [byMethod, byDay, payments] = await Promise.all([
    FeePayment.aggregate<{ _id: string; amountMinor: number; count: number }>([
      { $match: match },
      { $group: { _id: '$method', amountMinor: { $sum: { $subtract: ['$amountMinor', '$refundedMinor'] } }, count: { $sum: 1 } } },
      { $sort: { amountMinor: -1 } },
    ]),
    FeePayment.aggregate<{ _id: string; amountMinor: number; count: number }>([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: ctx.timezone } },
          amountMinor: { $sum: { $subtract: ['$amountMinor', '$refundedMinor'] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    FeePayment.find(match)
      .sort({ paidAt: -1 })
      .limit(500)
      .select('receiptNumber paidAt method amountMinor refundedMinor studentId receivedByUserId')
      .populate([
        { path: 'studentId', select: 'firstName lastName admissionNumber' },
        { path: 'receivedByUserId', select: 'firstName lastName' },
      ])
      .lean(),
  ]);

  return {
    from,
    to,
    totalMinor: byMethod.reduce((sum, m) => sum + m.amountMinor, 0),
    paymentCount: byMethod.reduce((sum, m) => sum + m.count, 0),
    byMethod: byMethod.map((m) => ({ method: m._id, amountMinor: m.amountMinor, count: m.count })),
    byDay: byDay.map((d) => ({ date: d._id, amountMinor: d.amountMinor, count: d.count })),
    payments: payments.map((p) => ({ ...p, netMinor: p.amountMinor - p.refundedMinor })),
    currency: ctx.currency,
  };
}

/**
 * Net collections for each of the last `months` calendar months in school
 * time, oldest first, zero-filled — the dashboard's collection trend.
 */
async function monthlyCollections(months: number, timezone: string, localToday: string) {
  const [y, m] = localToday.slice(0, 7).split('-').map(Number) as [number, number];
  const keys = Array.from({ length: months }, (_, i) => new Date(Date.UTC(y, m - months + i, 1)).toISOString().slice(0, 7));
  const rows = await FeePayment.aggregate<{ _id: string; amountMinor: number }>([
    { $match: { deletedAt: null, status: 'COMPLETED', paidAt: { $gte: zonedDayStart(`${keys[0]}-01`, timezone) } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone } },
        amountMinor: { $sum: { $subtract: ['$amountMinor', '$refundedMinor'] } },
      },
    },
  ]);
  const byMonth = new Map(rows.map((r) => [r._id, r.amountMinor]));
  return keys.map((month) => ({ month, amountMinor: byMonth.get(month) ?? 0 }));
}

/** Headline numbers for the fees overview and the school dashboard. */
export async function feeSummary() {
  const ctx = await schoolFinanceContext();
  const todayStart = startOfSchoolToday(ctx.timezone);
  // Payment times are instants, so "today"/"this month" are the school's real local midnights.
  const localToday = localDateString(new Date(), ctx.timezone);
  const collectTodayStart = zonedDayStart(localToday, ctx.timezone);
  const monthStart = zonedDayStart(`${localToday.slice(0, 7)}-01`, ctx.timezone);
  const session = await AcademicSession.findOne({ isCurrent: true, deletedAt: null }).select('_id name').lean();

  const invoiceMatch = { deletedAt: null, cancelledAt: null, ...(session ? { academicSessionId: session._id } : {}) };
  const [billed, overdue, collected, trend] = await Promise.all([
    FeeInvoice.aggregate<{ billedMinor: number; paidMinor: number; count: number }>([
      { $match: invoiceMatch },
      { $group: { _id: null, billedMinor: { $sum: '$totalMinor' }, paidMinor: { $sum: '$paidMinor' }, count: { $sum: 1 } } },
    ]),
    FeeInvoice.aggregate<{ overdueMinor: number; count: number; students: Types.ObjectId[] }>([
      { $match: overdueMatch(todayStart) },
      { $group: { _id: null, overdueMinor: { $sum: { $subtract: ['$totalMinor', '$paidMinor'] } }, count: { $sum: 1 }, students: { $addToSet: '$studentId' } } },
    ]),
    FeePayment.aggregate<{ _id: string; amountMinor: number }>([
      { $match: { deletedAt: null, status: 'COMPLETED', paidAt: { $gte: monthStart } } },
      {
        $group: {
          _id: { $cond: [{ $gte: ['$paidAt', collectTodayStart] }, 'today', 'earlier'] },
          amountMinor: { $sum: { $subtract: ['$amountMinor', '$refundedMinor'] } },
        },
      },
    ]),
    monthlyCollections(6, ctx.timezone, localToday),
  ]);

  const b = billed[0];
  const o = overdue[0];
  const today = collected.find((c) => c._id === 'today')?.amountMinor ?? 0;
  const month = collected.reduce((sum, c) => sum + c.amountMinor, 0);
  return {
    sessionName: session?.name ?? null,
    invoiceCount: b?.count ?? 0,
    billedMinor: b?.billedMinor ?? 0,
    collectedMinor: b?.paidMinor ?? 0,
    outstandingMinor: (b?.billedMinor ?? 0) - (b?.paidMinor ?? 0),
    overdueMinor: o?.overdueMinor ?? 0,
    overdueInvoiceCount: o?.count ?? 0,
    defaulterCount: o?.students.length ?? 0,
    collectedTodayMinor: today,
    collectedThisMonthMinor: month,
    monthlyCollections: trend,
    currency: ctx.currency,
  };
}
