import type { Types } from 'mongoose';
import { TeachingAssignment } from '../../models/TeachingAssignment';
import { AcademicSession } from '../../models/AcademicSession';
import { Student } from '../../models/Student';
import { Section } from '../../models/Section';
import { Class } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { Teacher } from '../../models/Teacher';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { assertExistsInSchool, listSort } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { teacherIdFor } from '../../services/teaching-scope.service';
import { getCurrentAcademicSession } from '../academic-sessions/academic-sessions.service';
import type { CreateAssignmentInput } from './teaching-assignments.validation';

const POPULATE = [
  { path: 'teacherId', select: 'employeeId', populate: { path: 'employeeId', select: 'firstName lastName employeeNumber' } },
  { path: 'classId', select: 'name order' },
  { path: 'sectionId', select: 'name' },
  { path: 'subjectId', select: 'name code' },
];

export async function listAssignments(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  for (const key of ['teacherId', 'classId', 'sectionId', 'subjectId'] as const) {
    if (typeof query[key] === 'string') filter[key] = query[key];
  }
  const sessionId = typeof query.academicSessionId === 'string' ? query.academicSessionId : (await getCurrentAcademicSession())?._id;
  if (sessionId) filter.academicSessionId = sessionId;

  const sort = listSort(query, ['createdAt'], { classId: 1, sectionId: 1, createdAt: 1 });
  const [items, total] = await Promise.all([
    TeachingAssignment.find(filter).sort(sort).skip(skip).limit(limit).populate(POPULATE).lean(),
    TeachingAssignment.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

async function getAssignment(id: string) {
  const assignment = await TeachingAssignment.findOne({ _id: id, deletedAt: null }).populate(POPULATE).lean();
  if (!assignment) throw AppError.notFound('Assignment not found');
  return assignment;
}

/**
 * A teacher's classes in one session: every section they're class teacher of
 * or teach in, with the subjects they take there, in class order.
 */
async function classesFor(teacherId: Types.ObjectId | string, academicSessionId: Types.ObjectId | string) {
  const classIds = (await Class.find({ academicSessionId, deletedAt: null }).select('_id').lean()).map((c) => c._id);
  const [own, assignments] = await Promise.all([
    Section.find({ classTeacherId: teacherId, classId: { $in: classIds }, deletedAt: null })
      .populate({ path: 'classId', select: 'name order' })
      .select('name classId')
      .lean(),
    TeachingAssignment.find({ teacherId, academicSessionId, deletedAt: null })
      .populate([{ path: 'classId', select: 'name order' }, { path: 'sectionId', select: 'name deletedAt' }, { path: 'subjectId', select: 'name code' }])
      .lean(),
  ]);

  type Ref = { _id: unknown; name: string; order?: number };
  /** A subject they take in the section, with the assignment that grants it (what removing it deletes). */
  type Taught = Ref & { code?: string; assignmentId: unknown };
  const bySection = new Map<string, { section: Ref; class: Ref; isClassTeacher: boolean; subjects: Taught[] }>();
  for (const s of own) {
    bySection.set(String(s._id), { section: { _id: s._id, name: s.name }, class: s.classId as unknown as Ref, isClassTeacher: true, subjects: [] });
  }
  for (const a of assignments) {
    const section = a.sectionId as unknown as (Ref & { deletedAt: Date | null }) | null;
    if (!section || section.deletedAt) continue;
    const key = String(section._id);
    const entry = bySection.get(key) ?? { section: { _id: section._id, name: section.name }, class: a.classId as unknown as Ref, isClassTeacher: false, subjects: [] };
    if (a.subjectId) entry.subjects.push({ ...(a.subjectId as unknown as Ref & { code?: string }), assignmentId: a._id });
    bySection.set(key, entry);
  }
  return [...bySection.values()].sort(
    (a, b) => (a.class.order ?? 0) - (b.class.order ?? 0) || a.class.name.localeCompare(b.class.name) || a.section.name.localeCompare(b.section.name),
  );
}

/**
 * The signed-in teacher's classes this session. Empty for someone who isn't
 * teaching staff.
 */
export async function myClasses(userId: string) {
  const teacherId = await teacherIdFor(userId);
  const current = await getCurrentAcademicSession();
  if (!teacherId || !current) return { sections: [] };
  return { sections: await classesFor(teacherId, current._id) };
}

/**
 * Any teacher's classes in a session (the current one by default) — their
 * staff profile's Classes tab, with each section's active roll so the office
 * sees the load. The session filter is how past years are looked back on.
 */
export async function teacherClasses(teacherId: string, academicSessionId: string | undefined) {
  const teacher = await Teacher.findOne({ _id: teacherId, deletedAt: null }).select('_id').lean();
  if (!teacher) throw AppError.notFound('Teacher not found');
  const session = academicSessionId
    ? await AcademicSession.findOne({ _id: academicSessionId, deletedAt: null }).select('name isCurrent startDate endDate').lean()
    : await getCurrentAcademicSession();
  if (academicSessionId && !session) throw AppError.badRequest('Academic session not found', { field: 'academicSessionId' });
  if (!session) return { academicSession: null, sections: [] };

  const sections = await classesFor(teacher._id, session._id);
  const rolls = sections.length
    ? await Student.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { sectionId: { $in: sections.map((s) => s.section._id as Types.ObjectId) }, status: 'ACTIVE', deletedAt: null } },
        { $group: { _id: '$sectionId', n: { $sum: 1 } } },
      ])
    : [];
  const rollOf = new Map(rolls.map((r) => [String(r._id), r.n]));
  return {
    academicSession: { _id: session._id, name: session.name, isCurrent: session.isCurrent, startDate: session.startDate, endDate: session.endDate },
    sections: sections.map((s) => ({ ...s, studentCount: rollOf.get(String(s.section._id)) ?? 0 })),
  };
}

export async function createAssignment(input: CreateAssignmentInput, actor: ActorMeta) {
  await assertExistsInSchool(Teacher, input.teacherId, 'Teacher', 'teacherId');
  await assertExistsInSchool(Subject, input.subjectId, 'Subject', 'subjectId');
  const section = await Section.findOne({ _id: input.sectionId, deletedAt: null }).select('classId').lean();
  if (!section) throw AppError.badRequest('Section not found', { field: 'sectionId' });
  const cls = await Class.findOne({ _id: section.classId, deletedAt: null }).select('academicSessionId').lean();
  if (!cls) throw AppError.badRequest('Section not found', { field: 'sectionId' });

  const clash = await TeachingAssignment.exists({ teacherId: input.teacherId, sectionId: section._id, subjectId: input.subjectId, deletedAt: null });
  if (clash) throw AppError.conflict('This teacher already teaches that subject to that section', { field: 'subjectId' });

  let created;
  try {
    created = await TeachingAssignment.create({
      schoolId: actor.schoolId,
      teacherId: input.teacherId,
      subjectId: input.subjectId,
      sectionId: section._id,
      classId: section.classId,
      academicSessionId: cls.academicSessionId,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw AppError.conflict('This teacher already teaches that subject to that section', { field: 'subjectId' });
    }
    throw err;
  }
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'teaching.assign',
    entity: 'TeachingAssignment',
    entityId: created._id,
    after: created.toObject(),
    ip: actor.ip,
  });
  return getAssignment(String(created._id));
}

export async function deleteAssignment(id: string, actor: ActorMeta): Promise<void> {
  const assignment = await TeachingAssignment.findOne({ _id: id, deletedAt: null });
  if (!assignment) throw AppError.notFound('Assignment not found');
  const before = assignment.toObject();
  assignment.deletedAt = new Date();
  await assignment.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'teaching.unassign',
    entity: 'TeachingAssignment',
    entityId: assignment._id,
    before,
    after: assignment.toObject(),
    ip: actor.ip,
  });
}
