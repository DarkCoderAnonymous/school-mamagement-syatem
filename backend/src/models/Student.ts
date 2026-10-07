import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * DESIGN CHOICE: the Student<->Guardian relation is embedded on Student as
 * `guardians: [{ guardianId, relation, isPrimary }]` rather than a separate
 * StudentGuardian join collection, since a student typically has 1-3
 * guardians and we never need to query "all students for a guardian" at
 * scale outside a single school (and when we do, it's a simple
 * `Student.find({ 'guardians.guardianId': id })`).
 */
export const GUARDIAN_RELATIONS = ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'] as const;
export const STUDENT_STATUSES = ['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED'] as const;
export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

const studentGuardianSubSchema = new Schema(
  {
    guardianId: { type: Schema.Types.ObjectId, ref: 'Guardian', required: true },
    relation: { type: String, enum: GUARDIAN_RELATIONS, required: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false },
);

const studentSchema = createTenantSchema({
  admissionNumber: { type: String, required: true, trim: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date, required: true },
  gender: { type: String, enum: GENDERS, required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
  academicSessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  guardians: { type: [studentGuardianSubSchema], default: [] },
  rollNumber: { type: String, trim: true },
  admissionDate: { type: Date, default: () => new Date() },
  address: { type: String, trim: true },
  bloodGroup: { type: String, trim: true },
  previousSchool: { type: String, trim: true },
  status: { type: String, enum: STUDENT_STATUSES, default: 'ACTIVE' },
});

// Partial-filtered so a soft-deleted row stops occupying the key: deletes are
// soft, so without this the value could never be reused (CLAUDE.md).
studentSchema.index(
  { schoolId: 1, admissionNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
studentSchema.index({ schoolId: 1, classId: 1, sectionId: 1 });
// The student list: filtered by class/section/status, sorted by name.
studentSchema.index({ schoolId: 1, deletedAt: 1, classId: 1, sectionId: 1, status: 1, lastName: 1 });
studentSchema.index({ schoolId: 1, 'guardians.guardianId': 1 });

export interface StudentGuardianLink {
  guardianId: Types.ObjectId;
  relation: (typeof GUARDIAN_RELATIONS)[number];
  isPrimary: boolean;
}

export interface StudentDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: (typeof GENDERS)[number];
  classId: Types.ObjectId;
  sectionId: Types.ObjectId;
  academicSessionId: Types.ObjectId;
  userId?: Types.ObjectId | null;
  guardians: StudentGuardianLink[];
  rollNumber?: string;
  admissionDate: Date;
  address?: string;
  bloodGroup?: string;
  previousSchool?: string;
  status: StudentStatus;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Student = model<StudentDoc>('Student', studentSchema);
