import { Types, type ClientSession } from 'mongoose';
import { FeeInvoice, type FeeInvoiceDoc, type InvoiceLine, type InvoiceStatus } from '../../models/FeeInvoice';
import { FeeStructure } from '../../models/FeeStructure';
import { FeeHead } from '../../models/FeeHead';
import { FeeConcession, type FeeConcessionDoc } from '../../models/FeeConcession';
import { FeePayment } from '../../models/FeePayment';
import { Class } from '../../models/Class';
import { Student } from '../../models/Student';
import { AcademicSession } from '../../models/AcademicSession';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { withTransaction } from '../../utils/transaction';
import { calendarDay, daysBetween, schoolFinanceContext, startOfSchoolToday } from '../../utils/school-time';
import { nextSequence } from '../../services/sequence.service';
import type {
  CreateInvoiceInput,
  GenerateInvoicesInput,
  InvoiceAdjustmentInput,
} from './fees.validation';

export const OPEN_STATUSES: InvoiceStatus[] = ['UNPAID', 'PARTIALLY_PAID'];

export function statusFor(totalMinor: number, paidMinor: number): InvoiceStatus {
  if (paidMinor >= totalMinor) return 'PAID';
  return paidMinor > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
}

/**
 * Brings `status` in line with the amounts after an atomic money update.
 * Money fields are only ever changed with guarded `$inc`s (never a
 * read-modify-save, which could overwrite a concurrent payment); this reads
 * the result inside the same transaction and fixes the derived status.
 */
export async function syncInvoiceStatus(invoiceId: Types.ObjectId | string, session: ClientSession): Promise<void> {
  const inv = await FeeInvoice.findById(invoiceId).session(session).select('totalMinor paidMinor status cancelledAt').lean();
  if (!inv || inv.cancelledAt) return;
  const status = statusFor(inv.totalMinor, inv.paidMinor);
  if (status !== inv.status) await FeeInvoice.updateOne({ _id: invoiceId }, { $set: { status } }, { session });
}

// ─── Concessions → lines ─────────────────────────────────────────────────────

interface PricedInvoice {
  lines: InvoiceLine[];
  concessions: { name: string; amountMinor: number }[];
  subtotalMinor: number;
  concessionMinor: number;
  totalMinor: number;
}

/**
 * Applies a student's standing concessions to the lines being billed.
 * PERCENT → a share of each matching line; FIXED with a head → off that line;
 * FIXED without a head → off the invoice as a whole. Nothing is reduced below
 * zero, and every amount is an integer (rounded to the nearest minor unit).
 */
export function priceInvoice(
  items: { feeHeadId?: Types.ObjectId | string | null; name: string; amountMinor: number }[],
  concessions: Pick<FeeConcessionDoc, 'name' | 'type' | 'value' | 'feeHeadId'>[],
): PricedInvoice {
  const lines: InvoiceLine[] = items.map((i) => ({
    feeHeadId: i.feeHeadId ? new Types.ObjectId(String(i.feeHeadId)) : null,
    name: i.name,
    amountMinor: i.amountMinor,
    concessionMinor: 0,
  }));
  const remaining = (l: InvoiceLine) => l.amountMinor - l.concessionMinor;
  const breakdown: { name: string; amountMinor: number }[] = [];
  let invoiceLevel = 0;

  for (const c of concessions) {
    let applied = 0;
    const targets = c.feeHeadId ? lines.filter((l) => l.feeHeadId && String(l.feeHeadId) === String(c.feeHeadId)) : lines;
    if (c.type === 'PERCENT') {
      for (const line of targets) {
        const cut = Math.min(remaining(line), Math.round((line.amountMinor * c.value) / 100));
        line.concessionMinor += cut;
        applied += cut;
      }
    } else if (c.feeHeadId) {
      let left = c.value;
      for (const line of targets) {
        const cut = Math.min(remaining(line), left);
        line.concessionMinor += cut;
        left -= cut;
        applied += cut;
      }
    } else {
      const open = lines.reduce((sum, l) => sum + remaining(l), 0) - invoiceLevel;
      applied = Math.min(open, c.value);
      invoiceLevel += applied;
    }
    if (applied > 0) breakdown.push({ name: c.name, amountMinor: applied });
  }

  const subtotalMinor = lines.reduce((sum, l) => sum + l.amountMinor, 0);
  const concessionMinor = lines.reduce((sum, l) => sum + l.concessionMinor, 0) + invoiceLevel;
  return { lines, concessions: breakdown, subtotalMinor, concessionMinor, totalMinor: subtotalMinor - concessionMinor };
}

async function concessionsByStudent(studentIds: Types.ObjectId[], session?: ClientSession) {
  const rows = await FeeConcession.find({ studentId: { $in: studentIds }, isActive: true, deletedAt: null })
    .sort({ createdAt: 1 })
    .session(session ?? null)
    .lean();
  const map = new Map<string, FeeConcessionDoc[]>();
  for (const r of rows) map.set(String(r.studentId), [...(map.get(String(r.studentId)) ?? []), r]);
  return map;
}

async function invoiceNumber(prefix: string, issueDate: Date, session: ClientSession): Promise<string> {
  return nextSequence('invoice', { prefix, segment: String(issueDate.getUTCFullYear()), padding: 5 }, session);
}

// ─── Bulk generation ─────────────────────────────────────────────────────────

interface GenerationPlan {
  classes: {
    classId: string;
    className: string;
    students: number;
    toBill: number;
    alreadyBilled: number;
    skippedReason: string | null;
    lines: { name: string; amountMinor: number }[];
    totalMinor: number;
  }[];
  invoices: (PricedInvoice & { studentId: Types.ObjectId; classId: Types.ObjectId; sectionId: Types.ObjectId })[];
  totalMinor: number;
  academicSessionId: Types.ObjectId;
}

/**
 * Works out exactly what a generation run would bill — the same function
 * backs the preview and the real run, so the preview can't disagree with what
 * gets created. Students already billed for this period are skipped, which is
 * what makes re-running a month safe.
 */
async function planGeneration(input: GenerateInvoicesInput): Promise<GenerationPlan> {
  const session = await AcademicSession.findOne({ isCurrent: true, deletedAt: null }).select('_id').lean();
  if (!session) throw AppError.badRequest('Set a current academic session first');

  const classes = await Class.find({ _id: { $in: input.classIds }, academicSessionId: session._id, deletedAt: null })
    .sort({ order: 1 })
    .lean();
  if (classes.length !== new Set(input.classIds).size) {
    throw AppError.badRequest('One or more classes were not found in the current session', { field: 'classIds' });
  }
  const classIds = classes.map((c) => c._id);

  const [structures, heads, students] = await Promise.all([
    FeeStructure.find({ classId: { $in: classIds }, academicSessionId: session._id, deletedAt: null }).lean(),
    FeeHead.find({ deletedAt: null }).select('name').lean(),
    Student.find({ classId: { $in: classIds }, status: 'ACTIVE', deletedAt: null }).select('classId sectionId').lean(),
  ]);
  const headNames = new Map(heads.map((h) => [String(h._id), h.name]));
  const wanted = input.feeHeadIds?.length ? new Set(input.feeHeadIds) : null;

  const studentIds = students.map((s) => s._id);
  const [existing, concessions] = await Promise.all([
    FeeInvoice.find({ studentId: { $in: studentIds }, periodKey: input.periodKey, cancelledAt: null, deletedAt: null })
      .select('studentId')
      .lean(),
    concessionsByStudent(studentIds),
  ]);
  const billed = new Set(existing.map((e) => String(e.studentId)));

  const plan: GenerationPlan = { classes: [], invoices: [], totalMinor: 0, academicSessionId: session._id };
  for (const cls of classes) {
    const structure = structures.find((s) => String(s.classId) === String(cls._id));
    const items = (structure?.items ?? [])
      .filter((i) => i.amountMinor > 0 && headNames.has(String(i.feeHeadId)) && (!wanted || wanted.has(String(i.feeHeadId))))
      .map((i) => ({ feeHeadId: i.feeHeadId, name: headNames.get(String(i.feeHeadId))!, amountMinor: i.amountMinor }));
    const roster = students.filter((s) => String(s.classId) === String(cls._id));
    const toBill = roster.filter((s) => !billed.has(String(s._id)));

    const skippedReason = !structure
      ? 'No fee structure for this class'
      : items.length === 0
        ? 'None of the selected fee heads are in this class’s structure'
        : null;

    let classTotal = 0;
    if (!skippedReason) {
      for (const s of toBill) {
        const priced = priceInvoice(items, concessions.get(String(s._id)) ?? []);
        plan.invoices.push({ ...priced, studentId: s._id, classId: cls._id, sectionId: s.sectionId });
        classTotal += priced.totalMinor;
      }
    }
    plan.classes.push({
      classId: String(cls._id),
      className: cls.name,
      students: roster.length,
      toBill: skippedReason ? 0 : toBill.length,
      alreadyBilled: roster.length - toBill.length,
      skippedReason,
      lines: items.map((i) => ({ name: i.name, amountMinor: i.amountMinor })),
      totalMinor: classTotal,
    });
    plan.totalMinor += classTotal;
  }
  return plan;
}

export async function previewGeneration(input: GenerateInvoicesInput) {
  const plan = await planGeneration(input);
  return { classes: plan.classes, invoiceCount: plan.invoices.length, totalMinor: plan.totalMinor };
}

/**
 * Creates the whole run in ONE transaction with per-school invoice numbers,
 * so a failure halfway leaves nothing behind and no numbers are burned. The
 * unique (student, period) index backstops a concurrent run of the same month.
 */
export async function generateInvoices(input: GenerateInvoicesInput, actor: ActorMeta) {
  const ctx = await schoolFinanceContext();
  const plan = await planGeneration(input);
  if (plan.invoices.length === 0) {
    throw AppError.badRequest('Nothing to bill — every student is already invoiced for this period, or no fees apply');
  }
  const issueDate = calendarDay(input.issueDate ?? new Date());
  const dueDate = calendarDay(input.dueDate);

  try {
    await withTransaction(async (session) => {
      const docs = [];
      for (const inv of plan.invoices) {
        docs.push({
          schoolId: actor.schoolId,
          invoiceNumber: await invoiceNumber(ctx.feeSettings.invoicePrefix, issueDate, session),
          studentId: inv.studentId,
          classId: inv.classId,
          sectionId: inv.sectionId,
          academicSessionId: plan.academicSessionId,
          periodKey: input.periodKey,
          periodLabel: input.periodLabel,
          issueDate,
          dueDate,
          lines: inv.lines,
          concessions: inv.concessions,
          subtotalMinor: inv.subtotalMinor,
          concessionMinor: inv.concessionMinor,
          totalMinor: inv.totalMinor,
          status: statusFor(inv.totalMinor, 0),
        });
      }
      await FeeInvoice.insertMany(docs, { session });
      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'fee.invoice.generate',
        entity: 'FeeInvoice',
        after: {
          periodKey: input.periodKey,
          periodLabel: input.periodLabel,
          classIds: input.classIds,
          invoiceCount: docs.length,
          totalMinor: plan.totalMinor,
        },
        ip: actor.ip,
        session,
      });
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw AppError.conflict('Another run billed some of these students for this period at the same time. Preview again and re-run.');
    }
    throw err;
  }

  return { invoiceCount: plan.invoices.length, totalMinor: plan.totalMinor, classes: plan.classes };
}

/** A one-off invoice for one student — an admission fee, a replacement ID card. */
export async function createInvoice(input: CreateInvoiceInput, actor: ActorMeta) {
  const ctx = await schoolFinanceContext();
  const student = await Student.findOne({ _id: input.studentId, deletedAt: null }).select('classId sectionId academicSessionId').lean();
  if (!student) throw AppError.badRequest('Student not found', { field: 'studentId' });
  const headIds = input.lines.map((l) => l.feeHeadId).filter(Boolean) as string[];
  if (headIds.length) {
    const found = await FeeHead.countDocuments({ _id: { $in: headIds }, deletedAt: null });
    if (found !== new Set(headIds).size) throw AppError.badRequest('One or more fee heads were not found', { field: 'lines' });
  }

  const concessions = input.applyConcessions ? ((await concessionsByStudent([student._id])).get(String(student._id)) ?? []) : [];
  const priced = priceInvoice(input.lines, concessions);
  const issueDate = calendarDay(new Date());
  // Ad-hoc invoices get their own period key so they never collide with a monthly run.
  const periodKey = input.periodKey ?? `ADHOC-${Date.now().toString(36).toUpperCase()}`;

  try {
    const id = await withTransaction(async (session) => {
      const [created] = await FeeInvoice.create(
        [
          {
            schoolId: actor.schoolId,
            invoiceNumber: await invoiceNumber(ctx.feeSettings.invoicePrefix, issueDate, session),
            studentId: student._id,
            classId: student.classId,
            sectionId: student.sectionId,
            academicSessionId: student.academicSessionId,
            periodKey,
            periodLabel: input.periodLabel,
            issueDate,
            dueDate: calendarDay(input.dueDate),
            ...priced,
            status: statusFor(priced.totalMinor, 0),
          },
        ],
        { session },
      );
      if (!created) throw AppError.internal('Failed to create the invoice');
      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'fee.invoice.create',
        entity: 'FeeInvoice',
        entityId: created._id,
        after: created.toObject(),
        ip: actor.ip,
        session,
      });
      return String(created._id);
    });
    return getInvoice(id);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw AppError.conflict('This student already has an invoice for that period', { field: 'periodKey' });
    }
    throw err;
  }
}

// ─── Reading ─────────────────────────────────────────────────────────────────

const INVOICE_POPULATE = [
  { path: 'studentId', select: 'firstName lastName admissionNumber' },
  { path: 'classId', select: 'name' },
  { path: 'sectionId', select: 'name' },
];

/** Adds the derived figures every screen needs: balance and whether it's overdue today. */
export function withDerived<T extends Pick<FeeInvoiceDoc, 'totalMinor' | 'paidMinor' | 'dueDate' | 'status'>>(inv: T, todayStart: Date) {
  const balanceMinor = Math.max(0, inv.totalMinor - inv.paidMinor);
  return {
    ...inv,
    balanceMinor,
    isOverdue: OPEN_STATUSES.includes(inv.status) && balanceMinor > 0 && new Date(inv.dueDate) < todayStart,
  };
}

export async function listInvoices(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const ctx = await schoolFinanceContext();
  const todayStart = startOfSchoolToday(ctx.timezone);
  const filter: Record<string, unknown> = { deletedAt: null };

  for (const key of ['classId', 'sectionId', 'studentId', 'periodKey'] as const) {
    if (typeof query[key] === 'string') filter[key] = query[key];
  }
  if (query.status === 'OVERDUE') Object.assign(filter, { status: { $in: OPEN_STATUSES }, dueDate: { $lt: todayStart } });
  else if (query.status === 'OPEN') filter.status = { $in: OPEN_STATUSES };
  else if (typeof query.status === 'string') filter.status = query.status;

  if (search) {
    const rx = searchRegex(search);
    const students = await Student.find({ deletedAt: null, $or: [{ firstName: rx }, { lastName: rx }, { admissionNumber: rx }] })
      .select('_id')
      .limit(500)
      .lean();
    filter.$or = [{ invoiceNumber: rx }, { studentId: { $in: students.map((s) => s._id) } }];
  }

  const sort = listSort(query, ['issueDate', 'dueDate', 'totalMinor', 'invoiceNumber', 'createdAt'], { issueDate: -1 });
  const [items, total] = await Promise.all([
    FeeInvoice.find(filter).sort({ ...sort, _id: -1 }).skip(skip).limit(limit).populate(INVOICE_POPULATE).lean(),
    FeeInvoice.countDocuments(filter),
  ]);
  return { items: items.map((i) => withDerived(i, todayStart)), meta: buildPaginationMeta(page, limit, total) };
}

export async function getInvoice(id: string) {
  const ctx = await schoolFinanceContext();
  const invoice = await FeeInvoice.findOne({ _id: id, deletedAt: null })
    .populate([
      { path: 'studentId', select: 'firstName lastName admissionNumber rollNumber guardians', populate: { path: 'guardians.guardianId', select: 'firstName lastName phone email' } },
      { path: 'classId', select: 'name' },
      { path: 'sectionId', select: 'name' },
      { path: 'adjustments.byUserId', select: 'firstName lastName' },
    ])
    .lean();
  if (!invoice) throw AppError.notFound('Invoice not found');
  const payments = await FeePayment.find({ 'allocations.invoiceId': invoice._id, deletedAt: null })
    .sort({ paidAt: 1 })
    .select('receiptNumber paidAt method status allocations refunds reversedAt amountMinor')
    .lean();
  return {
    ...withDerived(invoice, startOfSchoolToday(ctx.timezone)),
    payments: payments.map((p) => {
      const alloc = p.allocations.find((a) => String(a.invoiceId) === String(invoice._id));
      return {
        _id: p._id,
        receiptNumber: p.receiptNumber,
        paidAt: p.paidAt,
        method: p.method,
        status: p.status,
        appliedMinor: alloc?.amountMinor ?? 0,
        refundedMinor: alloc?.refundedMinor ?? 0,
      };
    }),
    currency: ctx.currency,
  };
}

// ─── Adjustments ─────────────────────────────────────────────────────────────

/**
 * A one-off discount (can't take the balance below zero) or fine on a single
 * invoice. Guarded atomic update, then status sync, in one transaction.
 */
export async function adjustInvoice(id: string, input: InvoiceAdjustmentInput, actor: ActorMeta) {
  const before = await FeeInvoice.findOne({ _id: id, deletedAt: null }).lean();
  if (!before) throw AppError.notFound('Invoice not found');
  if (before.cancelledAt) throw AppError.conflict('This invoice is cancelled');

  await withTransaction(async (session) => {
    const entry = { type: input.type, amountMinor: input.amountMinor, reason: input.reason, at: new Date(), byUserId: actor.actorUserId };
    const updated =
      input.type === 'DISCOUNT'
        ? await FeeInvoice.findOneAndUpdate(
            {
              _id: id,
              cancelledAt: null,
              $expr: { $gte: [{ $subtract: ['$totalMinor', '$paidMinor'] }, input.amountMinor] },
            },
            { $inc: { discountMinor: input.amountMinor, totalMinor: -input.amountMinor }, $push: { adjustments: entry } },
            { new: true, session },
          )
        : await FeeInvoice.findOneAndUpdate(
            { _id: id, cancelledAt: null },
            { $inc: { fineMinor: input.amountMinor, totalMinor: input.amountMinor }, $push: { adjustments: entry } },
            { new: true, session },
          );
    if (!updated) {
      throw AppError.badRequest('A discount can’t be more than what’s still owed on this invoice', { field: 'amountMinor' });
    }
    await syncInvoiceStatus(updated._id, session);
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: input.type === 'DISCOUNT' ? 'fee.invoice.discount' : 'fee.invoice.fine',
      entity: 'FeeInvoice',
      entityId: updated._id,
      before: { totalMinor: before.totalMinor, discountMinor: before.discountMinor, fineMinor: before.fineMinor },
      after: { totalMinor: updated.totalMinor, discountMinor: updated.discountMinor, fineMinor: updated.fineMinor, reason: input.reason },
      ip: actor.ip,
      session,
    });
  });
  return getInvoice(id);
}

/** Only an invoice nothing has been paid against can be cancelled — otherwise refund first. */
export async function cancelInvoice(id: string, reason: string, actor: ActorMeta) {
  const invoice = await FeeInvoice.findOne({ _id: id, deletedAt: null });
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (invoice.cancelledAt) throw AppError.conflict('This invoice is already cancelled');

  const res = await FeeInvoice.updateOne(
    { _id: id, cancelledAt: null, paidMinor: 0 },
    { $set: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } },
  );
  if (res.modifiedCount === 0) {
    throw AppError.conflict('Payments have been made against this invoice. Refund or reverse them before cancelling.');
  }
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'fee.invoice.cancel',
    entity: 'FeeInvoice',
    entityId: invoice._id,
    before: { status: invoice.status },
    after: { status: 'CANCELLED', reason },
    ip: actor.ip,
  });
  return getInvoice(id);
}

/**
 * Applies the school's late-fine rule to every overdue invoice, in the
 * school's timezone. The rule's result REPLACES the previous automatic fine
 * (only upward), so running this daily grows a per-day fine correctly and a
 * flat fine is charged once.
 */
export async function applyLateFines(actor: ActorMeta) {
  const ctx = await schoolFinanceContext();
  const rule = ctx.feeSettings;
  if (rule.lateFineType === 'NONE' || rule.lateFineAmountMinor <= 0) {
    throw AppError.badRequest('Late fines are switched off — set a rule in fee settings first');
  }
  const todayStart = startOfSchoolToday(ctx.timezone);
  const threshold = new Date(todayStart.getTime() - rule.graceDays * 86_400_000);

  const overdue = await FeeInvoice.find({
    deletedAt: null,
    cancelledAt: null,
    status: { $in: OPEN_STATUSES },
    dueDate: { $lt: threshold },
  })
    .select('dueDate lateFineMinor')
    .lean();

  let updated = 0;
  let addedMinor = 0;
  await withTransaction(async (session) => {
    updated = 0;
    addedMinor = 0;
    for (const inv of overdue) {
      const daysLate = daysBetween(calendarDay(inv.dueDate), todayStart) - rule.graceDays;
      if (daysLate <= 0) continue;
      let target = rule.lateFineType === 'FLAT' ? rule.lateFineAmountMinor : daysLate * rule.lateFineAmountMinor;
      if (rule.lateFineType === 'PER_DAY' && rule.maxFineMinor > 0) target = Math.min(target, rule.maxFineMinor);
      const increase = target - inv.lateFineMinor;
      if (increase <= 0) continue;
      // Guarded on the value we read, so two overlapping runs can't both add the increase.
      const res = await FeeInvoice.updateOne(
        { _id: inv._id, lateFineMinor: inv.lateFineMinor, cancelledAt: null },
        { $set: { lateFineMinor: target }, $inc: { totalMinor: increase } },
        { session },
      );
      if (res.modifiedCount === 0) continue;
      await syncInvoiceStatus(inv._id, session);
      updated += 1;
      addedMinor += increase;
    }
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'fee.invoice.late-fines',
      entity: 'FeeInvoice',
      after: { rule, invoicesFined: updated, addedMinor },
      ip: actor.ip,
      session,
    });
  });
  return { invoicesFined: updated, addedMinor };
}
