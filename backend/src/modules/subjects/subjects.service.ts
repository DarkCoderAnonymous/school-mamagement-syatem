import type { Types } from 'mongoose';
import { Subject } from '../../models/Subject';
import { Teacher } from '../../models/Teacher';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import type { CreateSubjectInput, UpdateSubjectInput } from './subjects.validation';

async function teacherCounts(subjectIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (subjectIds.length === 0) return new Map();
  const rows = await Teacher.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { subjectIds: { $in: subjectIds }, deletedAt: null } },
    { $unwind: '$subjectIds' },
    { $match: { subjectIds: { $in: subjectIds } } },
    { $group: { _id: '$subjectIds', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

export async function listSubjects(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (search) filter.$or = [{ name: searchRegex(search) }, { code: searchRegex(search) }];
  if (typeof query.isElective === 'boolean') filter.isElective = query.isElective;

  const safeSort = listSort(query, ['name', 'code', 'createdAt'], { name: 1 });
  const [subjects, total] = await Promise.all([
    Subject.find(filter).sort(safeSort).skip(skip).limit(limit).lean(),
    Subject.countDocuments(filter),
  ]);
  const counts = await teacherCounts(subjects.map((s) => s._id));
  const items = subjects.map((s) => ({ ...s, teacherCount: counts.get(String(s._id)) ?? 0 }));
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getSubjectById(id: string) {
  const subject = await Subject.findOne({ _id: id, deletedAt: null }).lean();
  if (!subject) throw AppError.notFound('Subject not found');
  const counts = await teacherCounts([subject._id]);
  return { ...subject, teacherCount: counts.get(String(subject._id)) ?? 0 };
}

async function assertCodeFree(code: string, exceptId?: string) {
  const clash = await Subject.findOne({
    code: code.toUpperCase(),
    deletedAt: null,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }).lean();
  if (clash) throw AppError.conflict(`Subject code ${code.toUpperCase()} is already used by ${clash.name}`, { field: 'code' });
}

export async function createSubject(input: CreateSubjectInput, actor: ActorMeta) {
  await assertCodeFree(input.code);
  const created = await Subject.create({ schoolId: actor.schoolId, ...input });
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'subject.create',
    entity: 'Subject',
    entityId: created._id,
    after: created.toObject(),
    ip: actor.ip,
  });
  return getSubjectById(String(created._id));
}

export async function updateSubject(id: string, input: UpdateSubjectInput, actor: ActorMeta) {
  const subject = await Subject.findOne({ _id: id, deletedAt: null });
  if (!subject) throw AppError.notFound('Subject not found');
  if (input.code && input.code.toUpperCase() !== subject.code) await assertCodeFree(input.code, id);

  const before = subject.toObject();
  subject.set(input);
  await subject.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'subject.update',
    entity: 'Subject',
    entityId: subject._id,
    before,
    after: subject.toObject(),
    ip: actor.ip,
  });
  return getSubjectById(id);
}

/**
 * Soft delete. Teachers keep the id in `subjectIds` — the teacher list
 * resolves subjects with `deletedAt: null`, so an archived subject simply
 * stops showing, and restoring it brings every assignment back intact.
 */
export async function deleteSubject(id: string, actor: ActorMeta) {
  const subject = await Subject.findOne({ _id: id, deletedAt: null });
  if (!subject) throw AppError.notFound('Subject not found');
  const before = subject.toObject();
  subject.deletedAt = new Date();
  await subject.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'subject.delete',
    entity: 'Subject',
    entityId: subject._id,
    before,
    after: subject.toObject(),
    ip: actor.ip,
  });
}
