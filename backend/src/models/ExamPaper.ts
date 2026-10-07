import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const PAPER_STATUSES = ['OPEN', 'SUBMITTED', 'VERIFIED', 'PUBLISHED'] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

/**
 * One subject sat by one class in one exam — a row on the date sheet, and
 * the unit marks are entered, checked and locked in:
 *
 *   OPEN       teachers enter and change marks
 *   SUBMITTED  the teacher says it's complete; read-only until returned
 *   VERIFIED   the exam controller has checked it
 *   PUBLISHED  the class's results are out; marks are locked for good
 *
 * A controller can return a SUBMITTED or VERIFIED paper to OPEN for a fix.
 */
const examPaperSchema = createTenantSchema({
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  /** Calendar day of the paper (UTC midnight), if scheduled. */
  date: { type: Date, default: null },
  /** "09:00", school local time. */
  startTime: { type: String, trim: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  durationMinutes: { type: Number, min: 5, max: 600 },
  maxMarks: { type: Number, required: true, min: 1, max: 1000 },
  passMarks: { type: Number, required: true, min: 0 },
  status: { type: String, enum: PAPER_STATUSES, default: 'OPEN' },
  submittedAt: { type: Date, default: null },
  submittedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },
  verifiedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  returnReason: { type: String, trim: true },
  publishedAt: { type: Date, default: null },
});

examPaperSchema.index(
  { schoolId: 1, examId: 1, classId: 1, subjectId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// The date sheet, and the marks-entry / verification queues.
examPaperSchema.index({ schoolId: 1, deletedAt: 1, examId: 1, classId: 1 });
examPaperSchema.index({ schoolId: 1, deletedAt: 1, status: 1, date: 1 });

export interface ExamPaperDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  examId: Types.ObjectId;
  classId: Types.ObjectId;
  subjectId: Types.ObjectId;
  date: Date | null;
  startTime?: string;
  durationMinutes?: number;
  maxMarks: number;
  passMarks: number;
  status: PaperStatus;
  submittedAt: Date | null;
  submittedByUserId?: Types.ObjectId | null;
  verifiedAt: Date | null;
  verifiedByUserId?: Types.ObjectId | null;
  returnReason?: string;
  publishedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ExamPaper = model<ExamPaperDoc>('ExamPaper', examPaperSchema);
