import type { ClientSession, Types } from 'mongoose';
import { FinanceCategory, type LedgerType } from '../../models/FinanceCategory';
import { LedgerEntry } from '../../models/LedgerEntry';
import { FeePayment, type PaymentMethod } from '../../models/FeePayment';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { exactRegex, listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { localDateString, schoolFinanceContext, zonedDayStart } from '../../utils/school-time';
import type { CreateEntryInput } from './finance.validation';

// ─── Categories ──────────────────────────────────────────────────────────────

export async function listCategories(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (typeof query.type === 'string') filter.type = query.type;
  if (search) filter.name = searchRegex(search);
  const [items, total] = await Promise.all([
    FinanceCategory.find(filter).sort(listSort(query, ['name', 'type'], { type: 1, name: 1 })).skip(skip).limit(limit).lean(),
    FinanceCategory.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getCategory(id: string) {
  const category = await FinanceCategory.findOne({ _id: id, deletedAt: null }).lean();
  if (!category) throw AppError.notFound('Category not found');
  return category;
}

async function assertNameFree(type: LedgerType, name: string, exceptId?: string) {
  const clash = await FinanceCategory.findOne({ type, name: exactRegex(name), deletedAt: null, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).lean();
  if (clash) throw AppError.conflict(`There's already a ${type.toLowerCase()} category called "${name}"`, { field: 'name' });
}

export async function createCategory(input: { name: string; type: LedgerType }, actor: ActorMeta) {
  await assertNameFree(input.type, input.name);
  const created = await FinanceCategory.create({ schoolId: actor.schoolId, ...input });
  await recordAudit({ schoolId: actor.schoolId, actorUserId: actor.actorUserId, action: 'finance.category.create', entity: 'FinanceCategory', entityId: created._id, after: created.toObject(), ip: actor.ip });
  return getCategory(String(created._id));
}

export async function updateCategory(id: string, name: string, actor: ActorMeta) {
  const category = await FinanceCategory.findOne({ _id: id, deletedAt: null });
  if (!category) throw AppError.notFound('Category not found');
  if (category.isSystem) throw AppError.conflict('This category is managed by the system and can’t be renamed');
  await assertNameFree(category.type, name, id);
  const before = category.toObject();
  category.name = name;
  await category.save();
  await recordAudit({ schoolId: actor.schoolId, actorUserId: actor.actorUserId, action: 'finance.category.update', entity: 'FinanceCategory', entityId: category._id, before, after: category.toObject(), ip: actor.ip });
  return getCategory(id);
}

export async function deleteCategory(id: string, actor: ActorMeta) {
  const category = await FinanceCategory.findOne({ _id: id, deletedAt: null });
  if (!category) throw AppError.notFound('Category not found');
  if (category.isSystem) throw AppError.conflict('This category is managed by the system and can’t be archived');
  const used = await LedgerEntry.countDocuments({ categoryId: category._id, deletedAt: null, voidedAt: null });
  if (used > 0) throw AppError.conflict(`${used} entr${used === 1 ? 'y is' : 'ies are'} filed under this category`);
  const before = category.toObject();
  category.deletedAt = new Date();
  await category.save();
  await recordAudit({ schoolId: actor.schoolId, actorUserId: actor.actorUserId, action: 'finance.category.delete', entity: 'FinanceCategory', entityId: category._id, before, after: category.toObject(), ip: actor.ip });
}

// ─── Entries ─────────────────────────────────────────────────────────────────

const ENTRY_POPULATE = [
  { path: 'categoryId', select: 'name type isSystem' },
  { path: 'recordedByUserId', select: 'firstName lastName' },
  { path: 'voidedByUserId', select: 'firstName lastName' },
];

export async function listEntries(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (!query.includeVoided) filter.voidedAt = null;
  if (typeof query.type === 'string') filter.type = query.type;
  if (typeof query.categoryId === 'string') filter.categoryId = query.categoryId;
  if (query.from instanceof Date || query.to instanceof Date) {
    filter.date = {
      ...(query.from instanceof Date ? { $gte: query.from } : {}),
      ...(query.to instanceof Date ? { $lte: query.to } : {}),
    };
  }
  if (search) {
    const rx = searchRegex(search);
    filter.$or = [{ description: rx }, { party: rx }, { reference: rx }];
  }
  const [items, total] = await Promise.all([
    LedgerEntry.find(filter)
      .sort({ ...listSort(query, ['date', 'amountMinor', 'createdAt'], { date: -1 }), _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate(ENTRY_POPULATE)
      .lean(),
    LedgerEntry.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getEntry(id: string) {
  const entry = await LedgerEntry.findOne({ _id: id, deletedAt: null }).populate(ENTRY_POPULATE).lean();
  if (!entry) throw AppError.notFound('Entry not found');
  return entry;
}

export async function createEntry(input: CreateEntryInput, actor: ActorMeta) {
  const category = await FinanceCategory.findOne({ _id: input.categoryId, deletedAt: null }).lean();
  if (!category) throw AppError.badRequest('Category not found', { field: 'categoryId' });
  if (category.type !== input.type) {
    throw AppError.badRequest(`"${category.name}" is an ${category.type.toLowerCase()} category`, { field: 'categoryId' });
  }
  const created = await LedgerEntry.create({ schoolId: actor.schoolId, ...input, recordedByUserId: actor.actorUserId });
  await recordAudit({ schoolId: actor.schoolId, actorUserId: actor.actorUserId, action: `finance.${input.type.toLowerCase()}.record`, entity: 'LedgerEntry', entityId: created._id, after: created.toObject(), ip: actor.ip });
  return getEntry(String(created._id));
}

/** Entries are never edited or deleted — a wrong one is voided (kept, with who and why). Payroll postings are voided only by the system. */
export async function voidEntry(id: string, reason: string, actor: ActorMeta) {
  const entry = await LedgerEntry.findOne({ _id: id, deletedAt: null });
  if (!entry) throw AppError.notFound('Entry not found');
  if (entry.voidedAt) throw AppError.conflict('This entry is already voided');
  if (entry.source !== 'MANUAL') throw AppError.conflict('Payroll postings come from a published run and can’t be voided here');
  const before = entry.toObject();
  entry.voidedAt = new Date();
  entry.set('voidedByUserId', actor.actorUserId);
  entry.voidReason = reason;
  await entry.save();
  await recordAudit({ schoolId: actor.schoolId, actorUserId: actor.actorUserId, action: 'finance.entry.void', entity: 'LedgerEntry', entityId: entry._id, before, after: entry.toObject(), ip: actor.ip });
  return getEntry(id);
}

/**
 * Posts an expense on behalf of another module (payroll) into a system
 * category, created on first use. Runs inside the caller's transaction so the
 * posting commits or rolls back with the thing that caused it.
 */
export async function postSystemExpense(
  input: {
    categoryName: string;
    amountMinor: number;
    date: Date;
    description: string;
    method: PaymentMethod;
    source: 'PAYROLL';
    sourceId: Types.ObjectId;
  },
  actor: ActorMeta,
  session: ClientSession,
) {
  const category = await FinanceCategory.findOneAndUpdate(
    { type: 'EXPENSE', name: input.categoryName, deletedAt: null },
    { $setOnInsert: { type: 'EXPENSE', name: input.categoryName, isSystem: true, deletedAt: null } },
    { upsert: true, new: true, session },
  );
  if (!category) throw AppError.internal('Failed to find the system category');
  const [entry] = await LedgerEntry.create(
    [
      {
        schoolId: actor.schoolId,
        type: 'EXPENSE',
        categoryId: category._id,
        amountMinor: input.amountMinor,
        date: input.date,
        description: input.description,
        method: input.method,
        recordedByUserId: actor.actorUserId,
        source: input.source,
        sourceId: input.sourceId,
      },
    ],
    { session },
  );
  return entry;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

/**
 * Money in and out by month, in the school's timezone: fee collections (from
 * FeePayment, net of refunds, reversals excluded), other income and expenses
 * (from the ledger, voided rows excluded) — plus this period's expenses by
 * category. Fees are never copied into the ledger, so nothing is double-counted.
 */
export async function financeSummary(months: number) {
  const ctx = await schoolFinanceContext();
  const today = localDateString(new Date(), ctx.timezone);
  const [y, m] = today.split('-').map(Number) as [number, number];
  const startMonth = new Date(Date.UTC(y, m - months, 1));
  const firstDay = startMonth.toISOString().slice(0, 10);
  const from = zonedDayStart(firstDay, ctx.timezone);
  const monthKey = { $dateToString: { format: '%Y-%m', date: '$date', timezone: ctx.timezone } };

  const [fees, ledger, byCategory] = await Promise.all([
    FeePayment.aggregate<{ _id: string; amountMinor: number }>([
      { $match: { deletedAt: null, status: 'COMPLETED', paidAt: { $gte: from } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: ctx.timezone } }, amountMinor: { $sum: { $subtract: ['$amountMinor', '$refundedMinor'] } } } },
    ]),
    LedgerEntry.aggregate<{ _id: { month: string; type: LedgerType }; amountMinor: number }>([
      { $match: { deletedAt: null, voidedAt: null, date: { $gte: from } } },
      { $group: { _id: { month: monthKey, type: '$type' }, amountMinor: { $sum: '$amountMinor' } } },
    ]),
    LedgerEntry.aggregate<{ _id: { categoryId: Types.ObjectId; type: LedgerType }; amountMinor: number }>([
      { $match: { deletedAt: null, voidedAt: null, date: { $gte: from } } },
      { $group: { _id: { categoryId: '$categoryId', type: '$type' }, amountMinor: { $sum: '$amountMinor' } } },
      { $sort: { amountMinor: -1 } },
    ]),
  ]);

  const monthsList = Array.from({ length: months }, (_, i) => new Date(Date.UTC(y, m - months + i, 1)).toISOString().slice(0, 7));
  const series = monthsList.map((month) => {
    const feeIncomeMinor = fees.find((f) => f._id === month)?.amountMinor ?? 0;
    const otherIncomeMinor = ledger.find((l) => l._id.month === month && l._id.type === 'INCOME')?.amountMinor ?? 0;
    const expenseMinor = ledger.find((l) => l._id.month === month && l._id.type === 'EXPENSE')?.amountMinor ?? 0;
    return { month, feeIncomeMinor, otherIncomeMinor, expenseMinor, netMinor: feeIncomeMinor + otherIncomeMinor - expenseMinor };
  });

  const categories = await FinanceCategory.find({ _id: { $in: byCategory.map((c) => c._id.categoryId) } }).select('name').lean();
  const names = new Map(categories.map((c) => [String(c._id), c.name]));
  const totals = series.reduce(
    (t, s) => ({
      feeIncomeMinor: t.feeIncomeMinor + s.feeIncomeMinor,
      otherIncomeMinor: t.otherIncomeMinor + s.otherIncomeMinor,
      expenseMinor: t.expenseMinor + s.expenseMinor,
      netMinor: t.netMinor + s.netMinor,
    }),
    { feeIncomeMinor: 0, otherIncomeMinor: 0, expenseMinor: 0, netMinor: 0 },
  );

  return {
    months: series,
    totals,
    byCategory: byCategory.map((c) => ({ categoryId: c._id.categoryId, name: names.get(String(c._id.categoryId)) ?? 'Archived category', type: c._id.type, amountMinor: c.amountMinor })),
    currency: ctx.currency,
  };
}
