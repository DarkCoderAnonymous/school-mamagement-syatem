import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema } from '../../utils/query';
import * as c from './students.controller';
import {
  createStudentSchema,
  listGuardiansQuerySchema,
  listStudentsQuerySchema,
  updateGuardianSchema,
  updateStudentSchema,
} from './students.validation';

/**
 * @openapi
 * /students:
 *   get: { summary: List students (class, section, status, guardian filters), tags: [Students], security: [{ bearerAuth: [] }] }
 *   post: { summary: Admit a student with their guardians, tags: [Students], security: [{ bearerAuth: [] }] }
 * /students/{id}:
 *   get: { summary: Get a student with class, section and guardians, tags: [Students], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update a student (placement, status, guardians), tags: [Students], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Archive a student, tags: [Students], security: [{ bearerAuth: [] }] }
 */
export const studentsRouter = Router();
studentsRouter.use(authenticate);
studentsRouter.get('/', requirePermission(Permission.STUDENT_READ), validate({ query: listStudentsQuerySchema }), c.listStudentsHandler);
studentsRouter.post('/', requirePermission(Permission.STUDENT_CREATE), validate({ body: createStudentSchema }), c.createStudentHandler);
studentsRouter.get('/:id', requirePermission(Permission.STUDENT_READ), validate({ params: idParamsSchema }), c.getStudentHandler);
studentsRouter.patch(
  '/:id',
  requirePermission(Permission.STUDENT_UPDATE),
  validate({ params: idParamsSchema, body: updateStudentSchema }),
  c.updateStudentHandler,
);
studentsRouter.delete('/:id', requirePermission(Permission.STUDENT_DELETE), validate({ params: idParamsSchema }), c.deleteStudentHandler);

/**
 * Guardians are managed through student.* — they exist only in relation to
 * the students they're responsible for.
 *
 * @openapi
 * /guardians:
 *   get: { summary: Search guardians (with their children), tags: [Students], security: [{ bearerAuth: [] }] }
 * /guardians/{id}:
 *   get: { summary: Get a guardian and their children, tags: [Students], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update a guardian's contact details, tags: [Students], security: [{ bearerAuth: [] }] }
 */
export const guardiansRouter = Router();
guardiansRouter.use(authenticate);
guardiansRouter.get('/', requirePermission(Permission.STUDENT_READ), validate({ query: listGuardiansQuerySchema }), c.listGuardiansHandler);
guardiansRouter.get('/:id', requirePermission(Permission.STUDENT_READ), validate({ params: idParamsSchema }), c.getGuardianHandler);
guardiansRouter.patch(
  '/:id',
  requirePermission(Permission.STUDENT_UPDATE),
  validate({ params: idParamsSchema, body: updateGuardianSchema }),
  c.updateGuardianHandler,
);
