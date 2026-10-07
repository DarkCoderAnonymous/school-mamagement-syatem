import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema } from '../../utils/query';
import * as c from './teachers.controller';
import { createTeacherSchema, listTeachersQuerySchema, updateTeacherSchema } from './teachers.validation';

/**
 * @openapi
 * /teachers:
 *   get: { summary: List teachers (search, status, subject filters), tags: [Teachers], security: [{ bearerAuth: [] }] }
 *   post: { summary: Add a teacher and give them a sign-in, tags: [Teachers], security: [{ bearerAuth: [] }] }
 * /teachers/{id}:
 *   get: { summary: Get a teacher with subjects, sections led and account status, tags: [Teachers], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update a teacher (TERMINATED disables their access), tags: [Teachers], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Archive a teacher and remove their teacher access, tags: [Teachers], security: [{ bearerAuth: [] }] }
 */
const router = Router();
router.use(authenticate);
router.get('/', requirePermission(Permission.TEACHER_READ), validate({ query: listTeachersQuerySchema }), c.listTeachersHandler);
router.post('/', requirePermission(Permission.TEACHER_CREATE), validate({ body: createTeacherSchema }), c.createTeacherHandler);
router.get('/:id', requirePermission(Permission.TEACHER_READ), validate({ params: idParamsSchema }), c.getTeacherHandler);
router.patch(
  '/:id',
  requirePermission(Permission.TEACHER_UPDATE),
  validate({ params: idParamsSchema, body: updateTeacherSchema }),
  c.updateTeacherHandler,
);
router.delete('/:id', requirePermission(Permission.TEACHER_DELETE), validate({ params: idParamsSchema }), c.deleteTeacherHandler);

export default router;
