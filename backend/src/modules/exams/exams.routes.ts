import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { heavyOperationLimiter } from '../../middleware/rateLimiter';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema } from '../../utils/query';
import * as c from './exams.controller';
import * as v from './exams.validation';

const can = requirePermission;
const params = validate({ params: idParamsSchema });

/**
 * @openapi
 * /exams/papers:
 *   get: { summary: "Papers across exams — marks-entry queue (mine=true) or verification queue (status=SUBMITTED)", tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/papers/{id}:
 *   get: { summary: "A paper's marks sheet: roster with marks (optional sectionId)", tags: [Exams], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Change a paper's date or marking scheme while open, tags: [Exams], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Remove a paper with no marks, tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/papers/{id}/marks:
 *   put: { summary: Save some or all marks on an open paper, tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/papers/{id}/submit:
 *   post: { summary: "Submit a complete paper for verification", tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/papers/{id}/verify:
 *   post: { summary: Verify a submitted paper, tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/papers/{id}/return:
 *   post: { summary: Return a paper to marks entry with a reason, tags: [Exams], security: [{ bearerAuth: [] }] }
 */
export const examPapersRouter = Router();
examPapersRouter.use(authenticate);
examPapersRouter.get('/', can(Permission.EXAM_READ), validate({ query: v.listPapersQuerySchema }), c.listPapers);
examPapersRouter.get('/:id', can(Permission.EXAM_READ), validate({ params: idParamsSchema, query: v.paperSheetQuerySchema }), c.getPaperSheet);
examPapersRouter.patch('/:id', can(Permission.EXAM_CREATE), validate({ params: idParamsSchema, body: v.updatePaperSchema }), c.updatePaper);
examPapersRouter.delete('/:id', can(Permission.EXAM_CREATE), params, c.deletePaper);
examPapersRouter.put('/:id/marks', can(Permission.EXAM_MARKS_ENTER), validate({ params: idParamsSchema, body: v.saveMarksSchema }), c.saveMarks);
examPapersRouter.post('/:id/submit', can(Permission.EXAM_MARKS_ENTER), params, c.submitPaper);
examPapersRouter.post('/:id/verify', can(Permission.EXAM_MARKS_PUBLISH), params, c.verifyPaper);
examPapersRouter.post('/:id/return', can(Permission.EXAM_MARKS_PUBLISH), validate({ params: idParamsSchema, body: v.reasonSchema }), c.returnPaper);

/**
 * @openapi
 * /exams/results:
 *   get: { summary: "Published results (filter by exam, class, section, student, PASS/FAIL), ranked", tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/results/{id}:
 *   get: { summary: A report card, tags: [Exams], security: [{ bearerAuth: [] }] }
 */
export const examResultsRouter = Router();
examResultsRouter.use(authenticate);
examResultsRouter.get('/', can(Permission.EXAM_READ), validate({ query: v.resultsQuerySchema }), c.listResults);
examResultsRouter.get('/:id', can(Permission.EXAM_READ), params, c.getResult);

/**
 * @openapi
 * /exams:
 *   get: { summary: Exams in a session (current by default) with paper progress, tags: [Exams], security: [{ bearerAuth: [] }] }
 *   post: { summary: Create an exam, tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/settings:
 *   get: { summary: Grading scale and whether positions are shown, tags: [Exams], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update the grading scale, tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/{id}:
 *   get: { summary: An exam with its date sheet and marks progress, tags: [Exams], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Rename or re-date an exam, tags: [Exams], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Delete an exam with no marks entered, tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/{id}/papers:
 *   post: { summary: "Add class × subject papers to the date sheet", tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/{id}/classes/{classId}/date-sheet:
 *   put: { summary: "Save one class's date sheet: create or reschedule its subjects' papers (one transaction)", tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/{id}/board:
 *   get: { summary: "Every class in the exam's session with its sections, strength and marks progress", tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/{id}/classes/{classId}/marks:
 *   get: { summary: "A class's award list: every paper × every student (optional sectionId), with totals", tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/{id}/students/{studentId}/marks:
 *   put: { summary: "Save one student's marks across their class's open papers", tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/{id}/publish:
 *   post: { summary: "Publish classes' results (all papers verified; one transaction; notifies families)", tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/{id}/withdraw:
 *   post: { summary: "Withdraw a class's published results for correction", tags: [Exams], security: [{ bearerAuth: [] }] }
 * /exams/{id}/analysis:
 *   get: { summary: "Pass rate, subject averages, grade distribution and toppers", tags: [Exams], security: [{ bearerAuth: [] }] }
 */
export const examsRouter = Router();
examsRouter.use(authenticate);
examsRouter.get('/settings', can(Permission.EXAM_READ), c.getSettings);
examsRouter.patch('/settings', can(Permission.EXAM_CREATE), validate({ body: v.gradingSettingsSchema }), c.updateSettings);
examsRouter.get('/', can(Permission.EXAM_READ), validate({ query: v.listExamsQuerySchema }), c.listExams);
examsRouter.post('/', can(Permission.EXAM_CREATE), validate({ body: v.createExamSchema }), c.createExam);
examsRouter.get('/:id', can(Permission.EXAM_READ), params, c.getExam);
examsRouter.patch('/:id', can(Permission.EXAM_CREATE), validate({ params: idParamsSchema, body: v.updateExamSchema }), c.updateExam);
examsRouter.delete('/:id', can(Permission.EXAM_CREATE), params, c.deleteExam);
examsRouter.post('/:id/papers', can(Permission.EXAM_CREATE), validate({ params: idParamsSchema, body: v.addPapersSchema }), c.addPapers);
examsRouter.put('/:id/classes/:classId/date-sheet', can(Permission.EXAM_CREATE), validate({ params: v.classParamsSchema, body: v.dateSheetSchema }), c.saveDateSheet);
examsRouter.get('/:id/board', can(Permission.EXAM_READ), params, c.getBoard);
examsRouter.get('/:id/classes/:classId/marks', can(Permission.EXAM_READ), validate({ params: v.classParamsSchema, query: v.classSheetQuerySchema }), c.getClassSheet);
examsRouter.put('/:id/students/:studentId/marks', can(Permission.EXAM_MARKS_ENTER), validate({ params: v.studentParamsSchema, body: v.saveStudentMarksSchema }), c.saveStudentMarks);
examsRouter.post('/:id/publish', can(Permission.EXAM_MARKS_PUBLISH), validate({ params: idParamsSchema, body: v.publishSchema }), c.publish);
examsRouter.post('/:id/withdraw', can(Permission.EXAM_MARKS_PUBLISH), validate({ params: idParamsSchema, body: v.unpublishSchema }), c.withdraw);
examsRouter.get('/:id/analysis', can(Permission.EXAM_READ), heavyOperationLimiter, validate({ params: idParamsSchema, query: v.analysisQuerySchema }), c.analysis);
