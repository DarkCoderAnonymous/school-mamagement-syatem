import type { Types } from 'mongoose';
import { Employee } from '../models/Employee';
import { Teacher } from '../models/Teacher';
import { Section } from '../models/Section';
import { TeachingAssignment } from '../models/TeachingAssignment';

/**
 * What a signed-in teacher teaches at this school, as the marks and
 * attendance checks need it. Reads run in the caller's tenant context, so a
 * userId only ever resolves to this school's teacher record.
 */

/** This person's Teacher record here, or null if they aren't teaching staff. */
export async function teacherIdFor(userId: string): Promise<Types.ObjectId | null> {
  const employee = await Employee.findOne({ userId, deletedAt: null }).select('_id').lean();
  if (!employee) return null;
  const teacher = await Teacher.findOne({ employeeId: employee._id, deletedAt: null }).select('_id').lean();
  return teacher?._id ?? null;
}

export const classSubjectKey = (classId: unknown, subjectId: unknown) => `${String(classId)}:${String(subjectId)}`;

/**
 * Every class + subject this person is assigned, as `classSubjectKey`s.
 * No session filter: a class belongs to exactly one session, so its id
 * already pins it.
 */
export async function assignedClassSubjects(userId: string): Promise<Set<string>> {
  const teacherId = await teacherIdFor(userId);
  if (!teacherId) return new Set();
  const rows = await TeachingAssignment.find({ teacherId, deletedAt: null }).select('classId subjectId').lean();
  return new Set(rows.map((r) => classSubjectKey(r.classId, r.subjectId)));
}

/** Sections whose daily register this person may mark: the ones they're class teacher of, or teach in. */
export async function markableSectionIds(userId: string): Promise<Set<string>> {
  const teacherId = await teacherIdFor(userId);
  if (!teacherId) return new Set();
  const [own, taught] = await Promise.all([
    Section.find({ classTeacherId: teacherId, deletedAt: null }).select('_id').lean(),
    TeachingAssignment.distinct('sectionId', { teacherId, deletedAt: null }),
  ]);
  return new Set([...own.map((s) => String(s._id)), ...taught.map(String)]);
}
