import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * A student's published result for one exam — what the report card prints.
 * Written once, when the class's results are published, as a SNAPSHOT
 * (names, max marks, grades, positions), so a later change to a subject,
 * a paper or the grading scale never rewrites a report card a family has.
 * Withdrawing results soft-deletes these rows; re-publishing writes new ones.
 */
const subjectResultSchema = new Schema(
  {
    examPaperId: { type: Schema.Types.ObjectId, ref: 'ExamPaper' },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    name: { type: String, required: true },
    code: { type: String },
    maxMarks: { type: Number, required: true },
    passMarks: { type: Number, required: true },
    marksObtained: { type: Number, default: null },
    isAbsent: { type: Boolean, default: false },
    percentage: { type: Number, required: true },
    grade: { type: String, required: true },
    passed: { type: Boolean, required: true },
    remarks: { type: String },
  },
  { _id: false },
);

const examResultSchema = createTenantSchema({
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', default: null },
  student: {
    name: { type: String, required: true },
    admissionNumber: { type: String, required: true },
    rollNumber: { type: String },
  },
  examName: { type: String, required: true },
  className: { type: String, required: true },
  sectionName: { type: String },
  subjects: { type: [subjectResultSchema], default: [] },
  totalObtained: { type: Number, required: true },
  totalMax: { type: Number, required: true },
  percentage: { type: Number, required: true },
  grade: { type: String, required: true },
  remark: { type: String },
  result: { type: String, enum: ['PASS', 'FAIL'], required: true },
  classRank: { type: Number, default: null },
  sectionRank: { type: Number, default: null },
  classSize: { type: Number, default: 0 },
  /** The grading scale this result was graded with — the report card's key must match its grades. */
  gradingBands: { type: [{ grade: String, minPercent: Number, remark: String, _id: false }], default: [] },
  publishedAt: { type: Date, required: true },
  publishedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

examResultSchema.index(
  { schoolId: 1, examId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// A class's ranked result sheet, and a student's results across exams.
examResultSchema.index({ schoolId: 1, deletedAt: 1, examId: 1, classId: 1, classRank: 1 });
examResultSchema.index({ schoolId: 1, studentId: 1, publishedAt: -1 });

export interface SubjectResult {
  examPaperId?: Types.ObjectId;
  subjectId?: Types.ObjectId;
  name: string;
  code?: string;
  maxMarks: number;
  passMarks: number;
  marksObtained: number | null;
  isAbsent: boolean;
  percentage: number;
  grade: string;
  passed: boolean;
  remarks?: string;
}

export interface ExamResultDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  examId: Types.ObjectId;
  studentId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId?: Types.ObjectId | null;
  student: { name: string; admissionNumber: string; rollNumber?: string };
  examName: string;
  className: string;
  sectionName?: string;
  subjects: SubjectResult[];
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  remark?: string;
  result: 'PASS' | 'FAIL';
  classRank: number | null;
  sectionRank: number | null;
  classSize: number;
  gradingBands: { grade: string; minPercent: number; remark?: string }[];
  publishedAt: Date;
  publishedByUserId?: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ExamResult = model<ExamResultDoc>('ExamResult', examResultSchema);
