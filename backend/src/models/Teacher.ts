import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/** Teacher-specific data, 1:1 with an Employee whose designation is teaching staff. */
const teacherSchema = createTenantSchema({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  qualification: { type: String, trim: true },
  specialization: { type: String, trim: true },
  /** Years of teaching before joining this school — for timetabling seniority. */
  experienceYears: { type: Number, min: 0, default: 0 },
});

/**
 * One teacher record per employee, PER SCHOOL.
 *
 * This was a bare `unique: true` on employeeId, which builds a global index —
 * so one school claiming an employeeId blocked every other school from using
 * it, and the resulting E11000 told them somebody else held it. On a tenant
 * collection that is both an availability bug and an existence oracle across
 * a tenant boundary. See finding 3 in docs/security/tenant-isolation-findings.md.
 *
 * Partial-filtered so a soft-deleted teacher doesn't permanently reserve its
 * employee (CLAUDE.md: unique indexes exclude soft-deleted records).
 */
teacherSchema.index(
  { schoolId: 1, employeeId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// "Who teaches Physics?" — the subject filter on the teacher list.
teacherSchema.index({ schoolId: 1, deletedAt: 1, subjectIds: 1 });

export interface TeacherDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  employeeId: Types.ObjectId;
  subjectIds: Types.ObjectId[];
  qualification?: string;
  specialization?: string;
  experienceYears: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Teacher = model<TeacherDoc>('Teacher', teacherSchema);
