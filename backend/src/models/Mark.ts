import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * One student's mark on one paper. `marksObtained` is null until entered;
 * an absent student has `isAbsent` and no marks. Halves are allowed (a mark
 * is not money). Only changed while the paper is OPEN.
 */
const markSchema = createTenantSchema({
  examPaperId: { type: Schema.Types.ObjectId, ref: 'ExamPaper', required: true },
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', default: null },
  marksObtained: { type: Number, default: null, min: 0 },
  isAbsent: { type: Boolean, default: false },
  remarks: { type: String, trim: true },
  enteredByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

markSchema.index(
  { schoolId: 1, examPaperId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
markSchema.index({ schoolId: 1, examId: 1, studentId: 1 });

export interface MarkDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  examPaperId: Types.ObjectId;
  examId: Types.ObjectId;
  studentId: Types.ObjectId;
  sectionId?: Types.ObjectId | null;
  marksObtained: number | null;
  isAbsent: boolean;
  remarks?: string;
  enteredByUserId?: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Mark = model<MarkDoc>('Mark', markSchema);
