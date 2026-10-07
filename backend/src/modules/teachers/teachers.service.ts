import { Types, type ClientSession } from 'mongoose';
import { Role } from '@sms/shared';
import { Employee } from '../../models/Employee';
import { Teacher } from '../../models/Teacher';
import { Subject } from '../../models/Subject';
import { Section } from '../../models/Section';
import { TeachingAssignment } from '../../models/TeachingAssignment';
import { SchoolMembership } from '../../models/SchoolMembership';
import { User } from '../../models/User';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { withTransaction } from '../../utils/transaction';
import { nextSequence } from '../../services/sequence.service';
import { bumpMembershipEpoch } from '../../services/auth-freshness.service';
import {
  provisionSchoolAccount,
  schoolRoleIds,
  sendAccountEmail,
} from '../../services/school-accounts.service';
import type { CreateTeacherInput, UpdateTeacherInput } from './teachers.validation';
import type { RoleActor } from '../roles/roles.service';
import { assertAdminRemains, assertMayChangeAccess } from '../members/member-guards';

const EMPLOYEE_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'designation',
  'department',
  'joiningDate',
  'status',
] as const;
const TEACHER_FIELDS = ['qualification', 'specialization', 'experienceYears', 'subjectIds'] as const;

/** Sort keys the list accepts, mapped onto the joined document. */
const SORT_FIELDS: Record<string, string> = {
  lastName: 'employee.lastName',
  firstName: 'employee.firstName',
  employeeNumber: 'employee.employeeNumber',
  joiningDate: 'employee.joiningDate',
  createdAt: 'createdAt',
};

async function assertSubjectsExist(subjectIds: string[] | undefined): Promise<void> {
  if (!subjectIds?.length) return;
  const unique = [...new Set(subjectIds)];
  const found = await Subject.countDocuments({ _id: { $in: unique }, deletedAt: null });
  if (found !== unique.length) throw AppError.badRequest('One or more subjects were not found', { field: 'subjectIds' });
}

/** Attaches subject names — resolved live so an archived subject drops out. */
async function withSubjects<T extends { subjectIds: Types.ObjectId[] }>(teachers: T[]) {
  const ids = [...new Set(teachers.flatMap((t) => t.subjectIds.map(String)))];
  const subjects = ids.length
    ? await Subject.find({ _id: { $in: ids }, deletedAt: null }).select('name code').lean()
    : [];
  const byId = new Map(subjects.map((s) => [String(s._id), s]));
  return teachers.map((t) => ({
    ...t,
    subjects: t.subjectIds.map((id) => byId.get(String(id))).filter(Boolean),
  }));
}

/**
 * Teachers joined to their Employee record, so the list can search and sort
 * by name. The tenant plugin scopes both the outer pipeline and the $lookup
 * sub-pipeline (pipeline form — the localField form is rejected by design).
 */
export async function listTeachers(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);

  const teacherMatch: Record<string, unknown> = { deletedAt: null };
  if (typeof query.subjectId === 'string') teacherMatch.subjectIds = new Types.ObjectId(query.subjectId);

  const employeeMatch: Record<string, unknown> = {};
  if (typeof query.status === 'string') employeeMatch['employee.status'] = query.status;
  if (search) {
    const rx = searchRegex(search);
    employeeMatch.$or = [
      { 'employee.firstName': rx },
      { 'employee.lastName': rx },
      { 'employee.email': rx },
      { 'employee.employeeNumber': rx },
    ];
  }

  const requested = listSort(query, Object.keys(SORT_FIELDS), { lastName: 1, firstName: 1 });
  const sortStage = Object.fromEntries(
    Object.entries(requested).map(([k, dir]) => [SORT_FIELDS[k] as string, dir]),
  );

  const [result] = await Teacher.aggregate<{
    items: (Record<string, unknown> & { subjectIds: Types.ObjectId[] })[];
    total: { n: number }[];
  }>([
    { $match: teacherMatch },
    {
      $lookup: {
        // Literal name: touching `Model.collection` at all is lint-banned
        // (raw driver access bypasses the tenant plugin), even just to read it.
        from: 'employees',
        let: { eid: '$employeeId' },
        pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$eid'] }, deletedAt: null } }],
        as: 'employee',
      },
    },
    { $unwind: '$employee' },
    { $match: employeeMatch },
    { $sort: { ...sortStage, _id: 1 } },
    { $facet: { items: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'n' }] } },
  ]);

  const items = await withSubjects(result?.items ?? []);
  return { items, meta: buildPaginationMeta(page, limit, result?.total[0]?.n ?? 0) };
}

export async function getTeacherById(id: string) {
  const teacher = await Teacher.findOne({ _id: id, deletedAt: null }).lean();
  if (!teacher) throw AppError.notFound('Teacher not found');
  const employee = await Employee.findOne({ _id: teacher.employeeId }).lean();
  if (!employee) throw AppError.notFound('Teacher not found');

  const [withNames] = await withSubjects([teacher]);
  const [membership, user, classTeacherOf] = await Promise.all([
    SchoolMembership.findOne({ userId: employee.userId, deletedAt: null }).select('status').lean(),
    User.findById(employee.userId).select('email status lastLoginAt mustChangePassword').lean(),
    Section.find({ classTeacherId: teacher._id, deletedAt: null })
      .select('name classId')
      .populate({ path: 'classId', select: 'name' })
      .lean(),
  ]);

  return {
    ...withNames,
    employee,
    classTeacherOf,
    account: user
      ? {
          email: user.email,
          accessStatus: membership?.status ?? 'DISABLED',
          lastLoginAt: user.lastLoginAt ?? null,
          pendingFirstSignIn: user.mustChangePassword,
        }
      : null,
  };
}

/** What a new teacher record can be created with; everything is optional and editable later. */
export interface TeacherDetails {
  designation?: string;
  department?: string;
  joiningDate?: Date;
  qualification?: string;
  specialization?: string;
  experienceYears?: number;
  subjectIds?: string[];
}

/**
 * Makes sure a school member has a teacher record — an Employee plus its
 * Teacher profile — linked from their membership, creating whatever is
 * missing inside the caller's transaction. An existing Employee (someone
 * already on payroll) is reused rather than duplicated.
 *
 * Called when a teacher is added from the Teachers page, and whenever the
 * built-in TEACHER role is granted from Staff & roles, so holding the role
 * always means appearing on the Teachers list.
 */
export async function ensureTeacherRecord(
  membershipId: Types.ObjectId | string,
  person: { firstName: string; lastName: string; email: string; phone?: string },
  actor: ActorMeta,
  session: ClientSession,
  details: TeacherDetails = {},
): Promise<{ teacherId: Types.ObjectId; created: boolean }> {
  const membership = await SchoolMembership.findOne({ _id: membershipId, deletedAt: null }).session(session);
  if (!membership) throw AppError.notFound('Staff member not found');

  const employees = await Employee.find({ userId: membership.userId, deletedAt: null }).sort({ createdAt: 1 }).session(session);
  const existing = employees.length
    ? await Teacher.findOne({ employeeId: { $in: employees.map((e) => e._id) }, deletedAt: null }).session(session).lean()
    : null;
  if (existing) {
    if (String(membership.teacherId ?? '') !== String(existing._id)) {
      await SchoolMembership.updateOne({ _id: membership._id }, { $set: { teacherId: existing._id } }, { session });
    }
    return { teacherId: existing._id, created: false };
  }

  let employee = employees[0];
  if (!employee) {
    const employeeNumber = await nextSequence('employee', { prefix: 'EMP' }, session);
    [employee] = await Employee.create(
      [
        {
          schoolId: actor.schoolId,
          userId: membership.userId,
          employeeNumber,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          phone: person.phone,
          designation: details.designation ?? 'Teacher',
          department: details.department,
          joiningDate: details.joiningDate ?? new Date(),
        },
      ],
      { session },
    );
    if (!employee) throw AppError.internal('Failed to create the employee record');
  }

  const [teacher] = await Teacher.create(
    [
      {
        schoolId: actor.schoolId,
        employeeId: employee._id,
        qualification: details.qualification,
        specialization: details.specialization,
        experienceYears: details.experienceYears,
        subjectIds: details.subjectIds ?? [],
      },
    ],
    { session },
  );
  if (!teacher) throw AppError.internal('Failed to create the teacher record');
  await SchoolMembership.updateOne({ _id: membership._id }, { $set: { teacherId: teacher._id } }, { session });

  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'teacher.create',
    entity: 'Teacher',
    entityId: teacher._id,
    after: { teacher: teacher.toObject(), employee: employee.toObject(), membershipId: membership._id },
    ip: actor.ip,
    session,
  });
  return { teacherId: teacher._id, created: true };
}

/** `membershipId` is the caller's own (for the self-check); scripts acting as no member omit it. */
export async function createTeacher(input: CreateTeacherInput, actor: ActorMeta & { membershipId?: string | null }) {
  await assertSubjectsExist(input.subjectIds);

  const outcome = await withTransaction(async (session) => {
    const account = await provisionSchoolAccount(
      {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        roles: [Role.TEACHER],
      },
      session,
    );
    // Adding yourself as a teacher merges TEACHER into your own membership —
    // a way round "you can't change your own roles" that could hand you
    // permissions you don't hold (a principal gaining marks entry). Someone
    // else has to add you, as on the Staff screen. Throwing here rolls the
    // whole transaction back.
    if (actor.membershipId && String(account.membershipId) === actor.membershipId) {
      throw AppError.forbidden("You can't add yourself as a teacher — ask another administrator");
    }

    const { teacherId, created } = await ensureTeacherRecord(
      account.membershipId,
      { firstName: input.firstName, lastName: input.lastName, email: account.email, phone: input.phone },
      actor,
      session,
      {
        designation: input.designation,
        department: input.department,
        joiningDate: input.joiningDate,
        qualification: input.qualification,
        specialization: input.specialization,
        experienceYears: input.experienceYears,
        subjectIds: input.subjectIds,
      },
    );
    // One teacher record per person per school.
    if (!created) throw AppError.conflict('This person is already a teacher at your school', { field: 'email' });

    return { teacherId: String(teacherId), account };
  });

  await sendAccountEmail(outcome.account, 'a teacher');
  return getTeacherById(outcome.teacherId);
}

/**
 * Status drives access: a TERMINATED teacher's membership is disabled so
 * their sign-in stops working at this school on the next request (the epoch
 * lookup only accepts ACTIVE memberships); moving back to ACTIVE or ON_LEAVE
 * restores it.
 */
export async function updateTeacher(id: string, input: UpdateTeacherInput, actor: RoleActor) {
  const teacher = await Teacher.findOne({ _id: id, deletedAt: null });
  if (!teacher) throw AppError.notFound('Teacher not found');
  const employee = await Employee.findOne({ _id: teacher.employeeId, deletedAt: null });
  if (!employee) throw AppError.notFound('Teacher not found');
  await assertSubjectsExist(input.subjectIds);

  const before = { teacher: teacher.toObject(), employee: employee.toObject() };
  const statusChanged = input.status !== undefined && input.status !== employee.status;

  await withTransaction(async (session) => {
    for (const f of EMPLOYEE_FIELDS) if (input[f] !== undefined) employee.set(f, input[f]);
    for (const f of TEACHER_FIELDS) if (input[f] !== undefined) teacher.set(f, input[f]);
    await employee.save({ session });
    await teacher.save({ session });

    if (statusChanged) {
      const membership = await SchoolMembership.findOne({ userId: employee.userId, deletedAt: null }).session(session);
      const nextStatus = input.status === 'TERMINATED' ? 'DISABLED' : 'ACTIVE';
      if (membership && membership.status !== nextStatus) {
        // Switching the membership on or off is an access decision, not just
        // a teacher-record edit: it must pass the same checks as the Staff
        // screen, or `teacher.update` becomes a way to lock out (or bring
        // back) an administrator who also teaches. TEACHER itself is this
        // screen's to manage, so only the person's other roles are weighed.
        await assertMayChangeAccess(membership, actor, { exemptRoleNames: [Role.TEACHER], session });
        membership.status = nextStatus;
        await membership.save({ session });
        await assertAdminRemains(session);
        await bumpMembershipEpoch(String(membership._id), session);
      }
    }

    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'teacher.update',
      entity: 'Teacher',
      entityId: teacher._id,
      before,
      after: { teacher: teacher.toObject(), employee: employee.toObject() },
      ip: actor.ip,
      session,
    });
  });

  return getTeacherById(id);
}

/**
 * Archives the teacher and ends their teaching access here: the TEACHER role
 * comes off their membership (a person who is also, say, an accountant keeps
 * that), sections they led lose their class teacher, and the membership's
 * epoch is bumped so a live token can't keep teacher permissions.
 */
export async function deleteTeacher(id: string, actor: ActorMeta) {
  const teacher = await Teacher.findOne({ _id: id, deletedAt: null });
  if (!teacher) throw AppError.notFound('Teacher not found');
  const employee = await Employee.findOne({ _id: teacher.employeeId });

  const before = { teacher: teacher.toObject(), employee: employee?.toObject() };
  const now = new Date();

  await withTransaction(async (session) => {
    teacher.deletedAt = now;
    await teacher.save({ session });
    if (employee && !employee.deletedAt) {
      employee.deletedAt = now;
      employee.status = 'TERMINATED';
      await employee.save({ session });
    }
    await Section.updateMany({ classTeacherId: teacher._id }, { $set: { classTeacherId: null } }, { session });
    // Their classes end with them — marks entry and registers go through these.
    await TeachingAssignment.updateMany({ teacherId: teacher._id, deletedAt: null }, { $set: { deletedAt: now } }, { session });

    if (employee) {
      const membership = await SchoolMembership.findOne({ userId: employee.userId, deletedAt: null }).session(session);
      if (membership) {
        const [teacherRoleId] = await schoolRoleIds([Role.TEACHER], session);
        const remaining = membership.roleIds.filter((r) => String(r) !== String(teacherRoleId));
        membership.set('roleIds', remaining);
        membership.set('teacherId', null);
        if (remaining.length === 0) membership.status = 'DISABLED';
        await membership.save({ session });
        await bumpMembershipEpoch(String(membership._id), session);
      }
    }

    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'teacher.delete',
      entity: 'Teacher',
      entityId: teacher._id,
      before,
      after: { teacher: teacher.toObject() },
      ip: actor.ip,
      session,
    });
  });
}
