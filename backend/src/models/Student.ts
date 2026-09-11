import { Schema, InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * DESIGN CHOICE: the Student<->Guardian relation is embedded on Student as
 * `guardians: [{ guardianId, relation, isPrimary }]` rather than a separate
 * StudentGuardian join collection, since a student typically has 1-3
 * guardians and we never need to query "all students for a guardian" at
 * scale outside a single school (and when we do, it's a simple
 * `Student.find({ 'guardians.guardianId': id })`).
 */
const studentGuardianSubSchema = new Schema(
  {
    guardianId: { type: Schema.Types.ObjectId, ref: 'Guardian', required: true },
    relation: { type: String, enum: ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'], required: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false },
);

const studentSchema = createTenantSchema({
  admissionNumber: { type: String, required: true, trim: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date, required: true },
  gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
  academicSessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  guardians: { type: [studentGuardianSubSchema], default: [] },
  rollNumber: { type: String, trim: true },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED'], default: 'ACTIVE' },
});

studentSchema.index({ schoolId: 1, admissionNumber: 1 }, { unique: true });
studentSchema.index({ schoolId: 1, classId: 1, sectionId: 1 });

export type StudentDoc = InferSchemaType<typeof studentSchema>;
export const Student = model('Student', studentSchema);
