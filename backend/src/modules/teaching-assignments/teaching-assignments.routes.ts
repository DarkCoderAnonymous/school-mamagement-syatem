import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema } from '../../utils/query';
import * as c from './teaching-assignments.controller';
import { createAssignmentSchema, listAssignmentsQuerySchema, teacherClassesQuerySchema } from './teaching-assignments.validation';

/**
 * Which teacher teaches which subject to which section. Managing them is part
 * of managing a teacher, so it shares the teacher.* permissions; `/mine` is
 * the caller's own classes and only needs to see classes at all.
 *
 * @openapi
 * /teaching-assignments:
 *   get: { summary: "List teaching assignments (current session by default)", tags: [Teachers], security: [{ bearerAuth: [] }] }
 *   post: { summary: Assign a teacher a subject in a section, tags: [Teachers], security: [{ bearerAuth: [] }] }
 * /teaching-assignments/mine:
 *   get: { summary: "The signed-in teacher's sections and subjects this session", tags: [Teachers], security: [{ bearerAuth: [] }] }
 * /teaching-assignments/teachers/{id}:
 *   get: { summary: "A teacher's sections and subjects in a session, with each section's roll (current session by default)", tags: [Teachers], security: [{ bearerAuth: [] }] }
 * /teaching-assignments/{id}:
 *   delete: { summary: Remove a teaching assignment, tags: [Teachers], security: [{ bearerAuth: [] }] }
 */
const router = Router();
router.use(authenticate);
router.get('/', requirePermission(Permission.TEACHER_READ), validate({ query: listAssignmentsQuerySchema }), c.listAssignmentsHandler);
router.get('/mine', requirePermission(Permission.CLASS_READ), c.myClassesHandler);
router.get(
  '/teachers/:id',
  requirePermission(Permission.TEACHER_READ),
  validate({ params: idParamsSchema, query: teacherClassesQuerySchema }),
  c.teacherClassesHandler,
);
router.post('/', requirePermission(Permission.TEACHER_UPDATE), validate({ body: createAssignmentSchema }), c.createAssignmentHandler);
router.delete('/:id', requirePermission(Permission.TEACHER_UPDATE), validate({ params: idParamsSchema }), c.deleteAssignmentHandler);

export default router;
