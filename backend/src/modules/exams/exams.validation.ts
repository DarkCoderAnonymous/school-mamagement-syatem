import { z } from 'zod';
import { EXAM_TYPES } from '../../models/Exam';
import { PAPER_STATUSES } from '../../models/ExamPaper';
import { listQueryBase, objectId } from '../../utils/query';

/** Marks may be halves (a mark is not money), so validation is "a multiple of 0.5". */
const halfStep = (n: number) => Number.isInteger(n * 2);
const marks = z.coerce.number().min(0).max(1000).refine(halfStep, 'Use whole or half marks');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

// ─── Exams ───────────────────────────────────────────────────────────────────
const examFields = {
  name: z.string().trim().min(1, 'Name is required').max(80),
  type: z.enum(EXAM_TYPES).default('OTHER'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  description: z.string().trim().max(300).optional(),
};
export const updateExamSchema = z.object({
  name: examFields.name.optional(),
  type: z.enum(EXAM_TYPES).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  description: examFields.description,
});
export const listExamsQuerySchema = z.object({
  ...listQueryBase,
  academicSessionId: objectId.optional(),
  type: z.enum(EXAM_TYPES).optional(),
});

// ─── Papers (date sheet) ─────────────────────────────────────────────────────
const paperFields = {
  date: z.coerce.date().nullable().optional(),
  startTime: time.optional(),
  durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
  maxMarks: marks.refine((n) => n >= 1, 'At least 1'),
  passMarks: marks,
};
const passWithinMax = (p: { maxMarks?: number; passMarks?: number }) =>
  p.maxMarks === undefined || p.passMarks === undefined || p.passMarks <= p.maxMarks;

export const addPapersSchema = z.object({
  classIds: z.array(objectId).min(1, 'Pick at least one class').max(50),
  subjects: z
    .array(z.object({ subjectId: objectId, ...paperFields }).refine(passWithinMax, { message: 'Pass marks exceed max marks', path: ['passMarks'] }))
    .min(1, 'Pick at least one subject')
    .max(30)
    .refine((s) => new Set(s.map((x) => x.subjectId)).size === s.length, 'Each subject can appear once'),
});
export const updatePaperSchema = z
  .object({
    date: paperFields.date,
    startTime: time.nullable().optional(),
    durationMinutes: z.coerce.number().int().min(5).max(600).nullable().optional(),
    maxMarks: paperFields.maxMarks.optional(),
    passMarks: marks.optional(),
  })
  .refine(passWithinMax, { message: 'Pass marks exceed max marks', path: ['passMarks'] });
/**
 * One class's date sheet, as the whole schedule for the subjects listed:
 * each row creates that subject's paper or replaces its date, time and
 * marking scheme. Subjects left out are untouched — removing a paper stays
 * an explicit delete, so a partial save can never drop one with marks.
 */
export const dateSheetSchema = z.object({
  papers: z
    .array(
      z
        .object({
          subjectId: objectId,
          date: z.coerce.date().nullable().default(null),
          startTime: time.nullable().default(null),
          durationMinutes: z.coerce.number().int().min(5).max(600).nullable().default(null),
          maxMarks: paperFields.maxMarks,
          passMarks: paperFields.passMarks,
        })
        .refine(passWithinMax, { message: 'Pass marks exceed max marks', path: ['passMarks'] }),
    )
    .min(1, 'Add at least one subject')
    .max(30)
    .refine((s) => new Set(s.map((x) => x.subjectId)).size === s.length, 'Each subject can appear once'),
});
/**
 * A new exam, optionally with its date sheet in the same save: the chosen
 * grades all sit the listed subjects on the listed days. Created in one
 * transaction, so a bad date sheet never leaves an exam behind.
 */
export const createExamSchema = z
  .object({
    ...examFields,
    academicSessionId: objectId.optional(),
    dateSheet: z
      .object({
        classIds: z.array(objectId).min(1, 'Pick at least one grade').max(50),
        papers: dateSheetSchema.shape.papers,
      })
      .optional(),
  })
  .refine((e) => e.endDate >= e.startDate, { message: 'The end date is before the start date', path: ['endDate'] });
export const classParamsSchema = z.object({ id: objectId, classId: objectId });
export const studentParamsSchema = z.object({ id: objectId, studentId: objectId });

export const listPapersQuerySchema = z.object({
  ...listQueryBase,
  examId: objectId.optional(),
  classId: objectId.optional(),
  subjectId: objectId.optional(),
  status: z.enum(PAPER_STATUSES).optional(),
  /** Only papers for subjects the caller teaches. */
  mine: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

// ─── Marks ───────────────────────────────────────────────────────────────────
export const paperSheetQuerySchema = z.object({ sectionId: objectId.optional() });
export const saveMarksSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: objectId,
        marksObtained: marks.nullable(),
        isAbsent: z.boolean().default(false),
        remarks: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(200)
    .refine((e) => new Set(e.map((x) => x.studentId)).size === e.length, 'Each student can appear once'),
});
/** Every subject's mark for one student, from the student-wise marks panel. */
export const saveStudentMarksSchema = z.object({
  entries: z
    .array(
      z.object({
        examPaperId: objectId,
        marksObtained: marks.nullable(),
        isAbsent: z.boolean().default(false),
        remarks: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(30)
    .refine((e) => new Set(e.map((x) => x.examPaperId)).size === e.length, 'Each paper can appear once'),
});
export const classSheetQuerySchema = z.object({ sectionId: objectId.optional() });
export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(200) });

// ─── Publishing & results ────────────────────────────────────────────────────
export const publishSchema = z.object({ classIds: z.array(objectId).min(1, 'Pick at least one class').max(50) });
export const unpublishSchema = z.object({ classId: objectId, reason: reasonSchema.shape.reason });
export const resultsQuerySchema = z.object({
  ...listQueryBase,
  examId: objectId.optional(),
  classId: objectId.optional(),
  sectionId: objectId.optional(),
  studentId: objectId.optional(),
  result: z.enum(['PASS', 'FAIL']).optional(),
  /** Comma-separated exam types — "UNIT_TEST,MOCK" is a student's class tests, the rest their term exams. */
  examType: z
    .string()
    .transform((v) => v.split(',').map((t) => t.trim()).filter(Boolean))
    .pipe(z.array(z.enum(EXAM_TYPES)).min(1).max(EXAM_TYPES.length))
    .optional(),
});
export const analysisQuerySchema = z.object({ classId: objectId.optional() });

export const gradingSettingsSchema = z.object({
  gradingBands: z
    .array(
      z.object({
        grade: z.string().trim().min(1).max(4),
        minPercent: z.coerce.number().min(0).max(100),
        remark: z.string().trim().max(40).optional(),
      }),
    )
    .min(2, 'Add at least two grades')
    .max(15)
    .refine((b) => b.some((x) => x.minPercent === 0), 'One grade must start at 0% so every score gets a grade')
    .refine((b) => new Set(b.map((x) => x.minPercent)).size === b.length, 'Two grades start at the same percentage')
    .refine((b) => new Set(b.map((x) => x.grade.toUpperCase())).size === b.length, 'Grade names must be unique')
    .optional(),
  showPositions: z.boolean().optional(),
});

export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type AddPapersInput = z.infer<typeof addPapersSchema>;
export type UpdatePaperInput = z.infer<typeof updatePaperSchema>;
export type SaveMarksInput = z.infer<typeof saveMarksSchema>;
export type DateSheetInput = z.infer<typeof dateSheetSchema>;
export type SaveStudentMarksInput = z.infer<typeof saveStudentMarksSchema>;
export type GradingSettingsInput = z.infer<typeof gradingSettingsSchema>;
