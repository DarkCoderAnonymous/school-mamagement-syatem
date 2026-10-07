import { Types, type ClientSession } from 'mongoose';
import { FeePayment, type FeePaymentDoc } from '../../models/FeePayment';
import { FeeInvoice } from '../../models/FeeInvoice';
import { FeeConcession } from '../../models/FeeConcession';
import { Student } from '../../models/Student';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { withTransaction } from '../../utils/transaction';
import { schoolFinanceContext, startOfSchoolToday } from '../../utils/school-time';
import { nextSequence } from '../../services/sequence.service';
import { OPEN_STATUSES, syncInvoiceStatus, withDerived } from './invoices.service';
import type { RecordPaymentInput, RefundPaymentInput } from './fees.validation';

const PAYMENT_POPULATE = [
  {
    path: 'studentId',
    select: 'firstName lastName admissionNumber classId sectionId',
    populate: [
      { path: 'classId', select: 'name' },
      { path: 'sectionId', select: 'name' },
    ],
  },
  { path: 'allocations.invoiceId', select: 'invoiceNumber periodLabel totalMinor paidMinor status' },
  { path: 'receivedByUserId', select: 'firstName lastName' },
  { path: 'refunds.byUserId', select: 'firstName lastName' },
  { path: 'reversedByUserId', select: 'firstName lastName' },
];

/** Moves money onto (positive) or off (negative) one invoice, never past its total or below zero. */
async function applyToInvoice(invoiceId: Types.ObjectId, amountMinor: number, session: ClientSession): Promise<boolean> {
  const guard =
    amountMinor > 0
      ? { $expr: { $lte: [{ $add: ['$paidMinor', amountMinor] }, '$totalMinor'] }, cancelledAt: null }
      : { paidMinor: { $gte: -amountMinor } };
  const res = await FeeInvoice.updateOne({ _id: invoiceId, ...guard }, { $inc: { paidMinor: amountMinor } }, { session });
  if (res.modifiedCount === 0) return false;
  await syncInvoiceStatus(invoiceId, session);
  return true;
}

// ─── Collect ─────────────────────────────────────────────────────────────────

/**
 * Records money received and settles the student's invoices with it — the
 * ones asked for, in that order, or else oldest due date first. One payment,
 * one receipt number, however many invoices it covers.
 *
 * Can't be more than the dues it's applied to (no silent credit balances),
 * and each invoice update is guarded so two cashiers taking the same family's
 * money at once can't overpay an invoice: the second write simply doesn't
 * match, and the whole transaction is refused.
 */
export async function recordPayment(input: RecordPaymentInput, actor: ActorMeta) {
  if (input.idempotencyKey) {
    const existing = await FeePayment.findOne({ idempotencyKey: input.idempotencyKey, deletedAt: null }).select('_id').lean();
    if (existing) return getPayment(String(existing._id));
  }

  const student = await Student.findOne({ _id: input.studentId, deletedAt: null }).select('_id').lean();
  if (!student) throw AppError.badRequest('Student not found', { field: 'studentId' });

  const ctx = await schoolFinanceContext();
  const open = await FeeInvoice.find({
    studentId: student._id,
    status: { $in: OPEN_STATUSES },
    cancelledAt: null,
    deletedAt: null,
  })
    .sort({ dueDate: 1, issueDate: 1 })
    .select('totalMinor paidMinor invoiceNumber')
    .lean();

  let targets = open;
  if (input.invoiceIds?.length) {
    const byId = new Map(open.map((i) => [String(i._id), i]));
    targets = input.invoiceIds.map((id) => byId.get(id)).filter((i): i is (typeof open)[number] => Boolean(i));
    if (targets.length !== input.invoiceIds.length) {
      throw AppError.badRequest('One or more invoices are not open dues of this student', { field: 'invoiceIds' });
    }
  }

  const due = targets.reduce((sum, i) => sum + (i.totalMinor - i.paidMinor), 0);
  if (due === 0) throw AppError.badRequest('This student has nothing to pay right now', { field: 'amountMinor' });
  if (input.amountMinor > due) {
    throw AppError.badRequest(`That's more than the ${due} due on the selected invoices`, { field: 'amountMinor', dueMinor: due });
  }

  let left = input.amountMinor;
  const allocations: { invoiceId: Types.ObjectId; amountMinor: number; refundedMinor: number }[] = [];
  for (const inv of targets) {
    if (left === 0) break;
    const take = Math.min(left, inv.totalMinor - inv.paidMinor);
    if (take > 0) allocations.push({ invoiceId: inv._id, amountMinor: take, refundedMinor: 0 });
    left -= take;
  }

  const paidAt = input.paidAt ?? new Date();
  try {
    const id = await withTransaction(async (session) => {
      for (const a of allocations) {
        if (!(await applyToInvoice(a.invoiceId, a.amountMinor, session))) {
          throw AppError.conflict('These dues changed while you were collecting (another payment?). Reload and try again.');
        }
      }
      const receiptNumber = await nextSequence(
        'receipt',
        { prefix: ctx.feeSettings.receiptPrefix, segment: String(paidAt.getUTCFullYear()), padding: 5 },
        session,
      );
      const [payment] = await FeePayment.create(
        [
          {
            schoolId: actor.schoolId,
            receiptNumber,
            studentId: student._id,
            allocations,
            amountMinor: input.amountMinor,
            method: input.method,
            reference: input.reference,
            note: input.note,
            paidAt,
            receivedByUserId: actor.actorUserId,
            idempotencyKey: input.idempotencyKey,
          },
        ],
        { session },
      );
      if (!payment) throw AppError.internal('Failed to record the payment');
      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'fee.payment.record',
        entity: 'FeePayment',
        entityId: payment._id,
        after: payment.toObject(),
        ip: actor.ip,
        session,
      });
      return String(payment._id);
    });
    return getPayment(id);
  } catch (err) {
    // The same attempt landing twice at once: the unique key let one through; return it.
    if ((err as { code?: number }).code === 11000 && input.idempotencyKey) {
      const existing = await FeePayment.findOne({ idempotencyKey: input.idempotencyKey, deletedAt: null }).select('_id').lean();
      if (existing) return getPayment(String(existing._id));
    }
    throw err;
  }
}

// ─── Refund & reversal ───────────────────────────────────────────────────────

/** Takes `amountMinor` back off the payment's invoices, newest allocation first. */
async function unwind(payment: FeePaymentDoc, amountMinor: number, session: ClientSession) {
  let left = amountMinor;
  const allocations = payment.allocations.map((a) => ({ ...a }));
  for (let i = allocations.length - 1; i >= 0 && left > 0; i -= 1) {
    const a = allocations[i]!;
    const take = Math.min(left, a.amountMinor - a.refundedMinor);
    if (take <= 0) continue;
    if (!(await applyToInvoice(a.invoiceId, -take, session))) {
      throw AppError.conflict('An invoice on this receipt changed underneath the refund. Reload and try again.');
    }
    a.refundedMinor += take;
    left -= take;
  }
  return allocations;
}

/** Money handed back to the family. Partial refunds are allowed; the receipt stays valid. */
export async function refundPayment(id: string, input: RefundPaymentInput, actor: ActorMeta) {
  const payment = await FeePayment.findOne({ _id: id, deletedAt: null }).lean();
  if (!payment) throw AppError.notFound('Payment not found');
  if (payment.status === 'REVERSED') throw AppError.conflict('This payment was reversed');
  const refundable = payment.amountMinor - payment.refundedMinor;
  if (input.amountMinor > refundable) {
    throw AppError.badRequest(`Only ${refundable} of this payment can still be refunded`, { field: 'amountMinor' });
  }

  await withTransaction(async (session) => {
    const allocations = await unwind(payment as FeePaymentDoc, input.amountMinor, session);
    const res = await FeePayment.updateOne(
      { _id: payment._id, status: 'COMPLETED', refundedMinor: payment.refundedMinor },
      {
        $set: { allocations },
        $inc: { refundedMinor: input.amountMinor },
        $push: { refunds: { ...input, at: new Date(), byUserId: actor.actorUserId } },
      },
      { session },
    );
    if (res.modifiedCount === 0) throw AppError.conflict('This payment changed while refunding. Reload and try again.');
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'fee.payment.refund',
      entity: 'FeePayment',
      entityId: payment._id,
      before: { refundedMinor: payment.refundedMinor },
      after: { refundedMinor: payment.refundedMinor + input.amountMinor, reason: input.reason, method: input.method },
      ip: actor.ip,
      session,
    });
  });
  return getPayment(id);
}

/**
 * Voids a payment recorded in error — a bounced cheque, the wrong student.
 * Whatever hasn't already been refunded comes off its invoices, and the
 * receipt is marked REVERSED. The row is kept for the audit trail.
 */
export async function reversePayment(id: string, reason: string, actor: ActorMeta) {
  const payment = await FeePayment.findOne({ _id: id, deletedAt: null }).lean();
  if (!payment) throw AppError.notFound('Payment not found');
  if (payment.status === 'REVERSED') throw AppError.conflict('This payment is already reversed');

  await withTransaction(async (session) => {
    const remaining = payment.amountMinor - payment.refundedMinor;
    const allocations = remaining > 0 ? await unwind(payment as FeePaymentDoc, remaining, session) : payment.allocations;
    const res = await FeePayment.updateOne(
      { _id: payment._id, status: 'COMPLETED', refundedMinor: payment.refundedMinor },
      {
        $set: {
          allocations,
          status: 'REVERSED',
          reversedAt: new Date(),
          reversedByUserId: actor.actorUserId,
          reversalReason: reason,
        },
      },
      { session },
    );
    if (res.modifiedCount === 0) throw AppError.conflict('This payment changed while reversing. Reload and try again.');
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'fee.payment.reverse',
      entity: 'FeePayment',
      entityId: payment._id,
      before: { status: 'COMPLETED', amountMinor: payment.amountMinor, refundedMinor: payment.refundedMinor },
      after: { status: 'REVERSED', reason },
      ip: actor.ip,
      session,
    });
  });
  return getPayment(id);
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export async function getPayment(id: string) {
  const payment = await FeePayment.findOne({ _id: id, deletedAt: null }).populate(PAYMENT_POPULATE).lean();
  if (!payment) throw AppError.notFound('Payment not found');
  const ctx = await schoolFinanceContext();
  return { ...payment, netMinor: payment.amountMinor - payment.refundedMinor, currency: ctx.currency, schoolName: ctx.name };
}

export async function listPayments(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  for (const key of ['studentId', 'method', 'status'] as const) {
    if (typeof query[key] === 'string') filter[key] = query[key];
  }
  if (query.from instanceof Date || query.to instanceof Date) {
    filter.paidAt = {
      ...(query.from instanceof Date ? { $gte: query.from } : {}),
      ...(query.to instanceof Date ? { $lte: query.to } : {}),
    };
  }
  if (search) filter.receiptNumber = searchRegex(search);
  const [items, total] = await Promise.all([
    FeePayment.find(filter)
      .sort({ ...listSort(query, ['paidAt', 'amountMinor', 'receiptNumber'], { paidAt: -1 }), _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate(PAYMENT_POPULATE.slice(0, 1).concat(PAYMENT_POPULATE.slice(2, 3)))
      .lean(),
    FeePayment.countDocuments(filter),
  ]);
  return {
    items: items.map((p) => ({ ...p, netMinor: p.amountMinor - p.refundedMinor })),
    meta: buildPaginationMeta(page, limit, total),
  };
}

/** Everything the collect screen needs for one student, in one request. */
export async function getStudentDues(studentId: string) {
  const ctx = await schoolFinanceContext();
  const student = await Student.findOne({ _id: studentId, deletedAt: null })
    .select('firstName lastName admissionNumber rollNumber classId sectionId guardians status')
    .populate([
      { path: 'classId', select: 'name' },
      { path: 'sectionId', select: 'name' },
      { path: 'guardians.guardianId', select: 'firstName lastName phone email' },
    ])
    .lean();
  if (!student) throw AppError.notFound('Student not found');

  const todayStart = startOfSchoolToday(ctx.timezone);
  const [invoices, payments, concessions] = await Promise.all([
    FeeInvoice.find({ studentId: student._id, status: { $in: OPEN_STATUSES }, cancelledAt: null, deletedAt: null })
      .sort({ dueDate: 1 })
      .lean(),
    FeePayment.find({ studentId: student._id, deletedAt: null }).sort({ paidAt: -1 }).limit(5).lean(),
    FeeConcession.find({ studentId: student._id, isActive: true, deletedAt: null }).populate({ path: 'feeHeadId', select: 'name' }).lean(),
  ]);
  const open = invoices.map((i) => withDerived(i, todayStart));
  return {
    student,
    invoices: open,
    totalDueMinor: open.reduce((sum, i) => sum + i.balanceMinor, 0),
    overdueMinor: open.filter((i) => i.isOverdue).reduce((sum, i) => sum + i.balanceMinor, 0),
    recentPayments: payments.map((p) => ({ ...p, netMinor: p.amountMinor - p.refundedMinor })),
    concessions,
    currency: ctx.currency,
  };
}
