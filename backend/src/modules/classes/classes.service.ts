import { Types } from 'mongoose';
import { Class } from '../../models/Class';
import { Section } from '../../models/Section';
import { Student } from '../../models/Student';
import { Teacher } from '../../models/Teacher';
import { AcademicSession } from '../../models/AcademicSession';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { assertExistsInSchool, exactRegex, listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { withTransaction } from '../../utils/transaction';
import type {
  CreateClassInput,
  CreateSectionInput,
  UpdateClassInput,
  UpdateSectionInput,
} from './classes.validation';

/** Active students per section, in one grouped read rather than one count per section. */
async function studentCountsBySection(sectionIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (sectionIds.length === 0) return new Map();
  // The tenant plugin prepends $match: { schoolId } to this pipeline.
  const rows = await Student.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { sectionId: { $in: sectionIds }, deletedAt: null, status: 'ACTIVE' } },
    { $group: { _id: '$sectionId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

const CLASS_TEACHER_POPULATE = {
  path: 'classTeacherId',
  select: 'employeeId',
  match: { deletedAt: null },
  populate: { path: 'employeeId', select: 'firstName lastName employeeNumber' },
};

/** Sections for the given classes, with class teacher and live student counts. */
async function sectionsFor(classIds: Types.ObjectId[]) {
  const sections = await Section.find({ classId: { $in: classIds }, deletedAt: null })
    .sort({ name: 1 })
    .populate(CLASS_TEACHER_POPULATE)
    .lean();
  const counts = await studentCountsBySection(sections.map((s) => s._id));
  return sections.map((s) => ({ ...s, studentCount: counts.get(String(s._id)) ?? 0 }));
}

async function resolveSessionId(requested?: string): Promise<Types.ObjectId> {
  if (requested) {
    await assertExistsInSchool(AcademicSession, requested, 'Academic session', 'academicSessionId');
    return new Types.ObjectId(requested);
  }
  const current = await AcademicSession.findOne({ isCurrent: true, deletedAt: null }).select('_id').lean();
  if (!current) {
    throw AppError.badRequest('Set up a current academic session before adding classes', {
      field: 'academicSessionId',
    });
  }
  return current._id;
}

/**
 * Classes for one session (the current one unless asked), each with its
 * sections embedded. Classes per school are tens, not thousands, so the
 * sections ride along instead of costing a request per class.
 */
export async function listClasses(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };

  const requested = typeof query.academicSessionId === 'string' ? query.academicSessionId : undefined;
  const current = requested
    ? null
    : await AcademicSession.findOne({ isCurrent: true, deletedAt: null }).select('_id').lean();
  const sessionId = requested ?? (current ? String(current._id) : undefined);
  if (sessionId) filter.academicSessionId = sessionId;
  if (search) filter.name = searchRegex(search);

  const safeSort = listSort(query, ['order', 'name', 'createdAt'], { order: 1, name: 1 });
  const [classes, total] = await Promise.all([
    Class.find(filter).sort(safeSort).skip(skip).limit(limit).lean(),
    Class.countDocuments(filter),
  ]);

  const sections = await sectionsFor(classes.map((c) => c._id));
  const items = classes.map((c) => {
    const own = sections.filter((s) => String(s.classId) === String(c._id));
    return {
      ...c,
      sections: own,
      studentCount: own.reduce((sum, s) => sum + s.studentCount, 0),
      capacity: own.reduce((sum, s) => sum + s.capacity, 0),
    };
  });

  return { items, meta: buildPaginationMeta(page, limit, total), academicSessionId: sessionId ?? null };
}

export async function getClassById(id: string) {
  const cls = await Class.findOne({ _id: id, deletedAt: null })
    .populate({ path: 'academicSessionId', select: 'name isCurrent' })
    .lean();
  if (!cls) throw AppError.notFound('Class not found');
  const sections = await sectionsFor([cls._id]);
  return {
    ...cls,
    sections,
    studentCount: sections.reduce((sum, s) => sum + s.studentCount, 0),
    capacity: sections.reduce((sum, s) => sum + s.capacity, 0),
  };
}

async function assertClassNameFree(name: string, sessionId: Types.ObjectId | string, exceptId?: string) {
  const clash = await Class.findOne({
    name: exactRegex(name),
    academicSessionId: sessionId,
    deletedAt: null,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }).lean();
  if (clash) throw AppError.conflict(`A class named "${name}" already exists in this session`, { field: 'name' });
}

export async function createClass(input: CreateClassInput, actor: ActorMeta) {
  const academicSessionId = await resolveSessionId(input.academicSessionId);
  await assertClassNameFree(input.name, academicSessionId);

  const created = await Class.create({
    schoolId: actor.schoolId,
    name: input.name,
    order: input.order,
    academicSessionId,
  });
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'class.create',
    entity: 'Class',
    entityId: created._id,
    after: created.toObject(),
    ip: actor.ip,
  });
  return getClassById(String(created._id));
}

export async function updateClass(id: string, input: UpdateClassInput, actor: ActorMeta) {
  const cls = await Class.findOne({ _id: id, deletedAt: null });
  if (!cls) throw AppError.notFound('Class not found');
  if (input.name && input.name !== cls.name) await assertClassNameFree(input.name, cls.academicSessionId, id);

  const before = cls.toObject();
  cls.set(input);
  await cls.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'class.update',
    entity: 'Class',
    entityId: cls._id,
    before,
    after: cls.toObject(),
    ip: actor.ip,
  });
  return getClassById(id);
}

/**
 * Archives a class and its sections together. Refused while any active
 * student is enrolled: archiving would orphan them from every class list,
 * attendance roster and fee run that resolves students through their class.
 */
export async function deleteClass(id: string, actor: ActorMeta) {
  const cls = await Class.findOne({ _id: id, deletedAt: null });
  if (!cls) throw AppError.notFound('Class not found');

  const enrolled = await Student.countDocuments({ classId: cls._id, deletedAt: null, status: 'ACTIVE' });
  if (enrolled > 0) {
    throw AppError.conflict(
      `${enrolled} active student${enrolled === 1 ? ' is' : 's are'} in this class. Move them before archiving it.`,
    );
  }

  const before = cls.toObject();
  const now = new Date();
  await withTransaction(async (session) => {
    cls.deletedAt = now;
    await cls.save({ session });
    await Section.updateMany({ classId: cls._id, deletedAt: null }, { $set: { deletedAt: now } }, { session });
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'class.delete',
      entity: 'Class',
      entityId: cls._id,
      before,
      after: cls.toObject(),
      ip: actor.ip,
      session,
    });
  });
}

// ─── Sections ────────────────────────────────────────────────────────────────

export async function listSections(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (typeof query.classId === 'string') filter.classId = query.classId;
  if (search) filter.name = searchRegex(search);

  const safeSort = listSort(query, ['name', 'createdAt'], { name: 1 });
  const [sections, total] = await Promise.all([
    Section.find(filter)
      .sort(safeSort)
      .skip(skip)
      .limit(limit)
      .populate({ path: 'classId', select: 'name order' })
      .populate(CLASS_TEACHER_POPULATE)
      .lean(),
    Section.countDocuments(filter),
  ]);
  const counts = await studentCountsBySection(sections.map((s) => s._id));
  const items = sections.map((s) => ({ ...s, studentCount: counts.get(String(s._id)) ?? 0 }));
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getSectionById(id: string) {
  const section = await Section.findOne({ _id: id, deletedAt: null })
    .populate({ path: 'classId', select: 'name order academicSessionId' })
    .populate(CLASS_TEACHER_POPULATE)
    .lean();
  if (!section) throw AppError.notFound('Section not found');
  const counts = await studentCountsBySection([section._id]);
  return { ...section, studentCount: counts.get(String(section._id)) ?? 0 };
}

async function assertSectionNameFree(classId: Types.ObjectId | string, name: string, exceptId?: string) {
  const clash = await Section.findOne({
    classId,
    name: exactRegex(name),
    deletedAt: null,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }).lean();
  if (clash) throw AppError.conflict(`Section "${name}" already exists in this class`, { field: 'name' });
}

export async function createSection(input: CreateSectionInput, actor: ActorMeta) {
  await assertExistsInSchool(Class, input.classId, 'Class', 'classId');
  await assertExistsInSchool(Teacher, input.classTeacherId, 'Teacher', 'classTeacherId');
  await assertSectionNameFree(input.classId, input.name);

  const created = await Section.create({ schoolId: actor.schoolId, ...input });
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'section.create',
    entity: 'Section',
    entityId: created._id,
    after: created.toObject(),
    ip: actor.ip,
  });
  return getSectionById(String(created._id));
}

export async function updateSection(id: string, input: UpdateSectionInput, actor: ActorMeta) {
  const section = await Section.findOne({ _id: id, deletedAt: null });
  if (!section) throw AppError.notFound('Section not found');
  await assertExistsInSchool(Teacher, input.classTeacherId, 'Teacher', 'classTeacherId');
  if (input.name && input.name !== section.name) await assertSectionNameFree(section.classId, input.name, id);

  if (input.capacity !== undefined) {
    const counts = await studentCountsBySection([section._id]);
    const enrolled = counts.get(String(section._id)) ?? 0;
    if (input.capacity < enrolled) {
      throw AppError.badRequest(`${enrolled} students are already in this section`, { field: 'capacity' });
    }
  }

  const before = section.toObject();
  section.set(input);
  await section.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'section.update',
    entity: 'Section',
    entityId: section._id,
    before,
    after: section.toObject(),
    ip: actor.ip,
  });
  return getSectionById(id);
}

export async function deleteSection(id: string, actor: ActorMeta) {
  const section = await Section.findOne({ _id: id, deletedAt: null });
  if (!section) throw AppError.notFound('Section not found');
  const enrolled = await Student.countDocuments({ sectionId: section._id, deletedAt: null, status: 'ACTIVE' });
  if (enrolled > 0) {
    throw AppError.conflict(
      `${enrolled} active student${enrolled === 1 ? ' is' : 's are'} in this section. Move them before archiving it.`,
    );
  }
  const before = section.toObject();
  section.deletedAt = new Date();
  await section.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'section.delete',
    entity: 'Section',
    entityId: section._id,
    before,
    after: section.toObject(),
    ip: actor.ip,
  });
}
