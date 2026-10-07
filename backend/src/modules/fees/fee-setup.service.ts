import { Types } from 'mongoose';
import { FeeHead } from '../../models/FeeHead';
import { FeeStructure } from '../../models/FeeStructure';
import { FeeConcession } from '../../models/FeeConcession';
import { Class } from '../../models/Class';
import { Student } from '../../models/Student';
import { School } from '../../models/School';
import { AcademicSession } from '../../models/AcademicSession';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { assertExistsInSchool, listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { schoolFinanceContext } from '../../utils/school-time';
import type {
  CreateConcessionInput,
  CreateFeeHeadInput,
  CreateFeeStructureInput,
  UpdateConcessionInput,
  UpdateFeeHeadInput,
  UpdateFeeSettingsInput,
  UpdateFeeStructureInput,
} from './fees.validation';

function audit(actor: ActorMeta, action: string, entity: string, entityId: Types.ObjectId, before: unknown, after: unknown) {
  return recordAudit({ schoolId: actor.schoolId, actorUserId: actor.actorUserId, action, entity, entityId, before, after, ip: actor.ip });
}

// ─── Fee heads ───────────────────────────────────────────────────────────────

export async function listFeeHeads(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (search) filter.$or = [{ name: searchRegex(search) }, { code: searchRegex(search) }];
  const [items, total] = await Promise.all([
    FeeHead.find(filter).sort(listSort(query, ['name', 'code', 'createdAt'], { name: 1 })).skip(skip).limit(limit).lean(),
    FeeHead.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getFeeHead(id: string) {
  const head = await FeeHead.findOne({ _id: id, deletedAt: null }).lean();
  if (!head) throw AppError.notFound('Fee head not found');
  return head;
}

async function assertHeadCodeFree(code: string, exceptId?: string) {
  const clash = await FeeHead.findOne({ code: code.toUpperCase(), deletedAt: null, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).lean();
  if (clash) throw AppError.conflict(`Code ${code.toUpperCase()} is already used by ${clash.name}`, { field: 'code' });
}

export async function createFeeHead(input: CreateFeeHeadInput, actor: ActorMeta) {
  await assertHeadCodeFree(input.code);
  const created = await FeeHead.create({ schoolId: actor.schoolId, ...input });
  await audit(actor, 'fee.head.create', 'FeeHead', created._id, null, created.toObject());
  return getFeeHead(String(created._id));
}

export async function updateFeeHead(id: string, input: UpdateFeeHeadInput, actor: ActorMeta) {
  const head = await FeeHead.findOne({ _id: id, deletedAt: null });
  if (!head) throw AppError.notFound('Fee head not found');
  if (input.code && input.code.toUpperCase() !== head.code) await assertHeadCodeFree(input.code, id);
  const before = head.toObject();
  head.set(input);
  await head.save();
  await audit(actor, 'fee.head.update', 'FeeHead', head._id, before, head.toObject());
  return getFeeHead(id);
}

/** Refused while a live fee structure still charges it — archive or edit the structure first. */
export async function deleteFeeHead(id: string, actor: ActorMeta) {
  const head = await FeeHead.findOne({ _id: id, deletedAt: null });
  if (!head) throw AppError.notFound('Fee head not found');
  const used = await FeeStructure.countDocuments({ 'items.feeHeadId': head._id, deletedAt: null });
  if (used > 0) throw AppError.conflict(`${used} fee structure${used === 1 ? ' uses' : 's use'} this head. Remove it from them first.`);
  const before = head.toObject();
  head.deletedAt = new Date();
  await head.save();
  await audit(actor, 'fee.head.delete', 'FeeHead', head._id, before, head.toObject());
}

// ─── Fee structures ──────────────────────────────────────────────────────────

const STRUCTURE_POPULATE = [
  { path: 'classId', select: 'name order' },
  { path: 'academicSessionId', select: 'name isCurrent' },
  { path: 'items.feeHeadId', select: 'name code frequency' },
];

function withTotal<T extends { items: { amountMinor: number }[] }>(s: T) {
  return { ...s, totalMinor: s.items.reduce((sum, i) => sum + i.amountMinor, 0) };
}

async function currentSessionId(requested?: string): Promise<Types.ObjectId> {
  if (requested) {
    await assertExistsInSchool(AcademicSession, requested, 'Academic session', 'academicSessionId');
    return new Types.ObjectId(requested);
  }
  const current = await AcademicSession.findOne({ isCurrent: true, deletedAt: null }).select('_id').lean();
  if (!current) throw AppError.badRequest('Set a current academic session first', { field: 'academicSessionId' });
  return current._id;
}

async function assertHeadsExist(items: { feeHeadId: string }[]) {
  const ids = items.map((i) => i.feeHeadId);
  const found = await FeeHead.countDocuments({ _id: { $in: ids }, deletedAt: null });
  if (found !== new Set(ids).size) throw AppError.badRequest('One or more fee heads were not found', { field: 'items' });
}

export async function listFeeStructures(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (typeof query.classId === 'string') filter.classId = query.classId;
  const sessionId =
    typeof query.academicSessionId === 'string'
      ? query.academicSessionId
      : (await AcademicSession.findOne({ isCurrent: true, deletedAt: null }).select('_id').lean())?._id;
  if (sessionId) filter.academicSessionId = sessionId;

  const [items, total] = await Promise.all([
    FeeStructure.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).populate(STRUCTURE_POPULATE).lean(),
    FeeStructure.countDocuments(filter),
  ]);
  // Ordered by class display order, which lives on the populated class.
  const sorted = items.sort(
    (a, b) => ((a.classId as unknown as { order?: number })?.order ?? 0) - ((b.classId as unknown as { order?: number })?.order ?? 0),
  );
  return { items: sorted.map(withTotal), meta: buildPaginationMeta(page, limit, total) };
}

export async function getFeeStructure(id: string) {
  const structure = await FeeStructure.findOne({ _id: id, deletedAt: null }).populate(STRUCTURE_POPULATE).lean();
  if (!structure) throw AppError.notFound('Fee structure not found');
  return withTotal(structure);
}

export async function createFeeStructure(input: CreateFeeStructureInput, actor: ActorMeta) {
  await assertExistsInSchool(Class, input.classId, 'Class', 'classId');
  await assertHeadsExist(input.items);
  const academicSessionId = await currentSessionId(input.academicSessionId);

  // One structure per class per session — see the model for why this is a service rule.
  const existing = await FeeStructure.findOne({ classId: input.classId, academicSessionId, deletedAt: null }).lean();
  if (existing) {
    throw AppError.conflict('This class already has a fee structure for the session — edit that one instead', { field: 'classId' });
  }

  const created = await FeeStructure.create({
    schoolId: actor.schoolId,
    name: input.name,
    classId: input.classId,
    academicSessionId,
    items: input.items,
  });
  await audit(actor, 'fee.structure.create', 'FeeStructure', created._id, null, created.toObject());
  return getFeeStructure(String(created._id));
}

/** Editing a structure changes FUTURE invoices only — issued invoices keep their snapshot lines. */
export async function updateFeeStructure(id: string, input: UpdateFeeStructureInput, actor: ActorMeta) {
  const structure = await FeeStructure.findOne({ _id: id, deletedAt: null });
  if (!structure) throw AppError.notFound('Fee structure not found');
  if (input.items) await assertHeadsExist(input.items);
  const before = structure.toObject();
  structure.set(input);
  await structure.save();
  await audit(actor, 'fee.structure.update', 'FeeStructure', structure._id, before, structure.toObject());
  return getFeeStructure(id);
}

export async function deleteFeeStructure(id: string, actor: ActorMeta) {
  const structure = await FeeStructure.findOne({ _id: id, deletedAt: null });
  if (!structure) throw AppError.notFound('Fee structure not found');
  const before = structure.toObject();
  structure.deletedAt = new Date();
  await structure.save();
  await audit(actor, 'fee.structure.delete', 'FeeStructure', structure._id, before, structure.toObject());
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getFeeSettings() {
  const ctx = await schoolFinanceContext();
  return { ...ctx.feeSettings, currency: ctx.currency, timezone: ctx.timezone };
}

export async function updateFeeSettings(input: UpdateFeeSettingsInput, actor: ActorMeta) {
  const ctx = await schoolFinanceContext();
  const next = { ...ctx.feeSettings, ...input };
  // School is a platform document, addressed by the caller's own schoolId from the token.
  await School.updateOne({ _id: ctx.schoolId }, { $set: { feeSettings: next } });
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'fee.settings.update',
    entity: 'School',
    entityId: ctx.schoolId,
    before: ctx.feeSettings,
    after: next,
    ip: actor.ip,
  });
  return getFeeSettings();
}

// ─── Concessions ─────────────────────────────────────────────────────────────

const CONCESSION_POPULATE = [
  { path: 'studentId', select: 'firstName lastName admissionNumber classId', populate: { path: 'classId', select: 'name' } },
  { path: 'feeHeadId', select: 'name code' },
];

export async function listConcessions(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (typeof query.studentId === 'string') filter.studentId = query.studentId;
  if (search) {
    const rx = searchRegex(search);
    const students = await Student.find({ deletedAt: null, $or: [{ firstName: rx }, { lastName: rx }, { admissionNumber: rx }] })
      .select('_id')
      .limit(500)
      .lean();
    filter.$or = [{ name: rx }, { studentId: { $in: students.map((s) => s._id) } }];
  }
  const [items, total] = await Promise.all([
    FeeConcession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate(CONCESSION_POPULATE).lean(),
    FeeConcession.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getConcession(id: string) {
  const concession = await FeeConcession.findOne({ _id: id, deletedAt: null }).populate(CONCESSION_POPULATE).lean();
  if (!concession) throw AppError.notFound('Concession not found');
  return concession;
}

export async function createConcession(input: CreateConcessionInput, actor: ActorMeta) {
  await assertExistsInSchool(Student, input.studentId, 'Student', 'studentId');
  await assertExistsInSchool(FeeHead, input.feeHeadId, 'Fee head', 'feeHeadId');
  const created = await FeeConcession.create({ schoolId: actor.schoolId, ...input, feeHeadId: input.feeHeadId ?? null });
  await audit(actor, 'fee.concession.create', 'FeeConcession', created._id, null, created.toObject());
  return getConcession(String(created._id));
}

export async function updateConcession(id: string, input: UpdateConcessionInput, actor: ActorMeta) {
  const concession = await FeeConcession.findOne({ _id: id, deletedAt: null });
  if (!concession) throw AppError.notFound('Concession not found');
  await assertExistsInSchool(FeeHead, input.feeHeadId, 'Fee head', 'feeHeadId');
  const nextType = input.type ?? concession.type;
  const nextValue = input.value ?? concession.value;
  if (nextType === 'PERCENT' && nextValue > 100) throw AppError.badRequest('A percentage can be at most 100', { field: 'value' });
  const before = concession.toObject();
  concession.set(input);
  await concession.save();
  await audit(actor, 'fee.concession.update', 'FeeConcession', concession._id, before, concession.toObject());
  return getConcession(id);
}

export async function deleteConcession(id: string, actor: ActorMeta) {
  const concession = await FeeConcession.findOne({ _id: id, deletedAt: null });
  if (!concession) throw AppError.notFound('Concession not found');
  const before = concession.toObject();
  concession.deletedAt = new Date();
  await concession.save();
  await audit(actor, 'fee.concession.delete', 'FeeConcession', concession._id, before, concession.toObject());
}
