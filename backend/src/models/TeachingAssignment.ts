import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * "This teacher teaches this subject to this section." The source of truth
 * for what a teacher may do in a class: which exam papers they may enter
 * marks for (exams/marks.service) and which sections' registers they may
 * mark besides their own (attendance.service). A teacher may hold any number,
 * across classes and subjects.
 *
 * `classId` and `academicSessionId` are copied from the section when the
 * assignment is made, so "this session's assignments" and "who teaches Maths
 * in Grade 5" are single indexed reads. A section never changes class, so the
 * copies can't drift. Next session's classes are new records, so its
 * assignments are too, and this session's stay as history.
 */
const teachingAssignmentSchema = createTenantSchema({
  teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  academicSessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
});

// Partial-filtered so a removed assignment can be made again (deletes are soft).
teachingAssignmentSchema.index(
  { schoolId: 1, teacherId: 1, sectionId: 1, subjectId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// A teacher's classes this session; the marks and attendance checks.
teachingAssignmentSchema.index({ schoolId: 1, deletedAt: 1, teacherId: 1, academicSessionId: 1 });
// The list screen: one session, by class then section.
teachingAssignmentSchema.index({ schoolId: 1, deletedAt: 1, academicSessionId: 1, classId: 1, sectionId: 1 });

export interface TeachingAssignmentDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  teacherId: Types.ObjectId;
  subjectId: Types.ObjectId;
  sectionId: Types.ObjectId;
  classId: Types.ObjectId;
  academicSessionId: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const TeachingAssignment = model<TeachingAssignmentDoc>('TeachingAssignment', teachingAssignmentSchema);
