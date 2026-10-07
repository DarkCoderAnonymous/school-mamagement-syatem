import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema } from '../../utils/query';
import * as c from './subjects.controller';
import { createSubjectSchema, listSubjectsQuerySchema, updateSubjectSchema } from './subjects.validation';

/**
 * Subjects share the class.* permissions: they are part of the same academic
 * structure, and a school that can shape its classes shapes its subjects.
 *
 * @openapi
 * /subjects:
 *   get: { summary: List subjects, tags: [Subjects], security: [{ bearerAuth: [] }] }
 *   post: { summary: Create a subject, tags: [Subjects], security: [{ bearerAuth: [] }] }
 * /subjects/{id}:
 *   get: { summary: Get a subject, tags: [Subjects], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update a subject, tags: [Subjects], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Archive a subject, tags: [Subjects], security: [{ bearerAuth: [] }] }
 */
const router = Router();
router.use(authenticate);
router.get('/', requirePermission(Permission.CLASS_READ), validate({ query: listSubjectsQuerySchema }), c.listSubjectsHandler);
router.post('/', requirePermission(Permission.CLASS_CREATE), validate({ body: createSubjectSchema }), c.createSubjectHandler);
router.get('/:id', requirePermission(Permission.CLASS_READ), validate({ params: idParamsSchema }), c.getSubjectHandler);
router.patch(
  '/:id',
  requirePermission(Permission.CLASS_UPDATE),
  validate({ params: idParamsSchema, body: updateSubjectSchema }),
  c.updateSubjectHandler,
);
router.delete('/:id', requirePermission(Permission.CLASS_DELETE), validate({ params: idParamsSchema }), c.deleteSubjectHandler);

export default router;
