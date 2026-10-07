import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const EXAM_TYPES = ['UNIT_TEST', 'MIDTERM', 'FINAL', 'MOCK', 'OTHER'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

/**
 * An examination in a session — "Mid-term 2026". What is sat, by whom and
 * when lives on its papers (one per class × subject: the date sheet). Status
 * isn't stored here: it's derived from the papers, so it can never disagree
 * with them.
 */
const examSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: EXAM_TYPES, default: 'OTHER' },
  academicSessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  description: { type: String, trim: true },
  createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

examSchema.index(
  { schoolId: 1, academicSessionId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
examSchema.index({ schoolId: 1, deletedAt: 1, academicSessionId: 1, startDate: -1 });

export interface ExamDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  type: ExamType;
  academicSessionId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  description?: string;
  createdByUserId?: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Exam = model<ExamDoc>('Exam', examSchema);
