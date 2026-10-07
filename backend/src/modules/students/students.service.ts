import type { ClientSession, Types } from 'mongoose';
import { Role } from '@sms/shared';
import { Student, type StudentGuardianLink } from '../../models/Student';
import { Guardian } from '../../models/Guardian';
import { Class } from '../../models/Class';
import { Section } from '../../models/Section';
import { AcademicSession } from '../../models/AcademicSession';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { withTransaction } from '../../utils/transaction';
import { nextSequence } from '../../services/sequence.service';
import {
  provisionSchoolAccount,
  sendAccountEmail,
  type ProvisionedAccount,
} from '../../services/school-accounts.service';
import type {
  CreateStudentInput,
  GuardianLinkInput,
  UpdateGuardianInput,
  UpdateStudentInput,
} from './students.validation';

const LIST_POPULATE = [
  { path: 'classId', select: 'name order' },
  { path: 'sectionId', select: 'name' },
  { path: 'guardians.guardianId', select: 'firstName lastName phone email' },
];

/**
 * The section must belong to the class — both ids come from the client, and
 * a mismatched pair would put a student on one class's roster and another's
 * attendance sheet. Returns the class's session, which the student inherits.
 */
async function resolvePlacement(classId: string, sectionId: string): Promise<Types.ObjectId> {
  const cls = await Class.findOne({ _id: classId, deletedAt: null }).select('academicSessionId').lean();
  if (!cls) throw AppError.badRequest('Class not found', { field: 'classId' });
  const section = await Section.findOne({ _id: sectionId, classId, deletedAt: null }).select('_id').lean();
  if (!section) throw AppError.badRequest('That section is not part of the selected class', { field: 'sectionId' });
  return cls.academicSessionId;
}

/**
 * Turns the guardian payload into stored links: existing guardians are
 * verified to belong to this school, new ones are created, and one link is
 * always primary (the first, if the user didn't pick). Parent sign-ins are
 * provisioned here and returned so the caller can email them after commit.
 */
async function resolveGuardians(
  input: GuardianLinkInput[],
  session: ClientSession,
): Promise<{ links: StudentGuardianLink[]; accounts: ProvisionedAccount[] }> {
  const links: StudentGuardianLink[] = [];
  const accounts: ProvisionedAccount[] = [];
  const hasPrimary = input.some((g) => g.isPrimary);

  for (const [index, g] of input.entries()) {
    let guardianId: Types.ObjectId;
    if ('guardianId' in g) {
      const existing = await Guardian.findOne({ _id: g.guardianId, deletedAt: null }).session(session).lean();
      if (!existing) throw AppError.badRequest('Guardian not found', { field: `guardians.${index}.guardianId` });
      guardianId = existing._id;
    } else {
      const [created] = await Guardian.create(
        [
          {
            firstName: g.firstName,
            lastName: g.lastName,
            phone: g.phone,
            email: g.email || undefined,
            occupation: g.occupation,
            address: g.address,
          },
        ],
        { session },
      );
      if (!created) throw AppError.internal('Failed to create the guardian');
      guardianId = created._id;

      if (g.createLogin && g.email) {
        const account = await provisionSchoolAccount(
          {
            email: g.email,
            firstName: g.firstName,
            lastName: g.lastName,
            phone: g.phone,
            roles: [Role.PARENT],
            links: { guardianId },
          },
          session,
        );
        await Guardian.updateOne({ _id: guardianId }, { $set: { userId: account.userId } }, { session });
        accounts.push(account);
      }
    }

    if (links.some((l) => String(l.guardianId) === String(guardianId))) {
      throw AppError.badRequest('The same guardian is listed twice', { field: 'guardians' });
    }
    links.push({ guardianId, relation: g.relation, isPrimary: hasPrimary ? g.isPrimary : index === 0 });
  }

  return { links, accounts };
}

export async function listStudents(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  for (const key of ['classId', 'sectionId', 'status', 'gender'] as const) {
    if (typeof query[key] === 'string') filter[key] = query[key];
  }
  if (typeof query.guardianId === 'string') filter['guardians.guardianId'] = query.guardianId;
  if (search) {
    const rx = searchRegex(search);
    filter.$or = [{ firstName: rx }, { lastName: rx }, { admissionNumber: rx }, { rollNumber: rx }];
  }

  const safeSort = listSort(
    query,
    ['lastName', 'firstName', 'admissionNumber', 'rollNumber', 'admissionDate', 'createdAt'],
    { lastName: 1, firstName: 1 },
  );
  const [items, total] = await Promise.all([
    Student.find(filter).sort({ ...safeSort, _id: 1 }).skip(skip).limit(limit).populate(LIST_POPULATE).lean(),
    Student.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getStudentById(id: string) {
  const student = await Student.findOne({ _id: id, deletedAt: null })
    .populate([
      { path: 'classId', select: 'name order' },
      { path: 'sectionId', select: 'name room classTeacherId' },
      { path: 'academicSessionId', select: 'name isCurrent' },
      { path: 'guardians.guardianId', select: 'firstName lastName phone email occupation address userId' },
    ])
    .lean();
  if (!student) throw AppError.notFound('Student not found');
  return student;
}

export async function createStudent(input: CreateStudentInput, actor: ActorMeta) {
  const academicSessionId = await resolvePlacement(input.classId, input.sectionId);
  const session = await AcademicSession.findById(academicSessionId).select('startDate').lean();
  const year = (session?.startDate ?? new Date()).getUTCFullYear();

  const outcome = await withTransaction(async (dbSession) => {
    const { guardians, ...fields } = input;
    const { links, accounts } = await resolveGuardians(guardians, dbSession);
    const admissionNumber = await nextSequence('admission', { prefix: 'ADM', segment: String(year) }, dbSession);
    const [student] = await Student.create(
      [{ ...fields, schoolId: actor.schoolId, academicSessionId, admissionNumber, guardians: links }],
      { session: dbSession },
    );
    if (!student) throw AppError.internal('Failed to create the student');

    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'student.create',
      entity: 'Student',
      entityId: student._id,
      after: student.toObject(),
      ip: actor.ip,
      session: dbSession,
    });
    return { studentId: String(student._id), accounts };
  });

  for (const account of outcome.accounts) await sendAccountEmail(account, 'a parent');
  return getStudentById(outcome.studentId);
}

export async function updateStudent(id: string, input: UpdateStudentInput, actor: ActorMeta) {
  const student = await Student.findOne({ _id: id, deletedAt: null });
  if (!student) throw AppError.notFound('Student not found');

  const placementChanged = input.classId !== undefined || input.sectionId !== undefined;
  const academicSessionId = placementChanged
    ? await resolvePlacement(input.classId ?? String(student.classId), input.sectionId ?? String(student.sectionId))
    : student.academicSessionId;

  const before = student.toObject();
  const outcome = await withTransaction(async (dbSession) => {
    const { guardians, ...fields } = input;
    student.set(fields);
    student.academicSessionId = academicSessionId;
    let accounts: ProvisionedAccount[] = [];
    if (guardians) {
      const resolved = await resolveGuardians(guardians, dbSession);
      student.set('guardians', resolved.links);
      accounts = resolved.accounts;
    }
    await student.save({ session: dbSession });
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'student.update',
      entity: 'Student',
      entityId: student._id,
      before,
      after: student.toObject(),
      ip: actor.ip,
      session: dbSession,
    });
    return accounts;
  });

  for (const account of outcome) await sendAccountEmail(account, 'a parent');
  return getStudentById(id);
}

export async function deleteStudent(id: string, actor: ActorMeta) {
  const student = await Student.findOne({ _id: id, deletedAt: null });
  if (!student) throw AppError.notFound('Student not found');
  const before = student.toObject();
  student.deletedAt = new Date();
  await student.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'student.delete',
    entity: 'Student',
    entityId: student._id,
    before,
    after: student.toObject(),
    ip: actor.ip,
  });
}

// ─── Guardians ───────────────────────────────────────────────────────────────

export async function listGuardians(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (search) {
    const rx = searchRegex(search);
    filter.$or = [{ firstName: rx }, { lastName: rx }, { phone: rx }, { email: rx }];
  }
  const safeSort = listSort(query, ['lastName', 'firstName', 'createdAt'], { lastName: 1, firstName: 1 });
  const [guardians, total] = await Promise.all([
    Guardian.find(filter).sort(safeSort).skip(skip).limit(limit).lean(),
    Guardian.countDocuments(filter),
  ]);

  // Children per guardian, for the "which family is this?" picker.
  const ids = guardians.map((g) => g._id);
  const children = ids.length
    ? await Student.find({ 'guardians.guardianId': { $in: ids }, deletedAt: null })
        .select('firstName lastName admissionNumber guardians.guardianId')
        .lean()
    : [];
  const items = guardians.map((g) => ({
    ...g,
    children: children
      .filter((c) => c.guardians.some((l) => String(l.guardianId) === String(g._id)))
      .map((c) => ({ _id: c._id, firstName: c.firstName, lastName: c.lastName, admissionNumber: c.admissionNumber })),
  }));
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getGuardianById(id: string) {
  const guardian = await Guardian.findOne({ _id: id, deletedAt: null }).lean();
  if (!guardian) throw AppError.notFound('Guardian not found');
  const children = await Student.find({ 'guardians.guardianId': guardian._id, deletedAt: null })
    .select('firstName lastName admissionNumber classId sectionId status')
    .populate(LIST_POPULATE.slice(0, 2))
    .lean();
  return { ...guardian, children };
}

export async function updateGuardian(id: string, input: UpdateGuardianInput, actor: ActorMeta) {
  const guardian = await Guardian.findOne({ _id: id, deletedAt: null });
  if (!guardian) throw AppError.notFound('Guardian not found');
  const before = guardian.toObject();
  guardian.set({ ...input, email: input.email === '' ? undefined : input.email });
  await guardian.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'guardian.update',
    entity: 'Guardian',
    entityId: guardian._id,
    before,
    after: guardian.toObject(),
    ip: actor.ip,
  });
  return getGuardianById(id);
}
