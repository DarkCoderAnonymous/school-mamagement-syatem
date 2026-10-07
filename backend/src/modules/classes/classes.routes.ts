import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema } from '../../utils/query';
import * as c from './classes.controller';
import {
  createClassSchema,
  createSectionSchema,
  listClassesQuerySchema,
  listSectionsQuerySchema,
  updateClassSchema,
  updateSectionSchema,
} from './classes.validation';

/**
 * @openapi
 * /classes:
 *   get:
 *     summary: List classes (current session by default) with their sections
 *     tags: [Classes]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: Create a class
 *     tags: [Classes]
 *     security: [{ bearerAuth: [] }]
 * /classes/{id}:
 *   get: { summary: Get a class with its sections, tags: [Classes], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update a class, tags: [Classes], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Archive a class and its sections, tags: [Classes], security: [{ bearerAuth: [] }] }
 */
export const classesRouter = Router();
classesRouter.use(authenticate);
classesRouter.get('/', requirePermission(Permission.CLASS_READ), validate({ query: listClassesQuerySchema }), c.listClassesHandler);
classesRouter.post('/', requirePermission(Permission.CLASS_CREATE), validate({ body: createClassSchema }), c.createClassHandler);
classesRouter.get('/:id', requirePermission(Permission.CLASS_READ), validate({ params: idParamsSchema }), c.getClassHandler);
classesRouter.patch(
  '/:id',
  requirePermission(Permission.CLASS_UPDATE),
  validate({ params: idParamsSchema, body: updateClassSchema }),
  c.updateClassHandler,
);
classesRouter.delete('/:id', requirePermission(Permission.CLASS_DELETE), validate({ params: idParamsSchema }), c.deleteClassHandler);

/**
 * @openapi
 * /sections:
 *   get: { summary: List sections (filter by classId), tags: [Classes], security: [{ bearerAuth: [] }] }
 *   post: { summary: Add a section to a class, tags: [Classes], security: [{ bearerAuth: [] }] }
 * /sections/{id}:
 *   get: { summary: Get a section, tags: [Classes], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update a section (name, capacity, room, class teacher), tags: [Classes], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Archive a section, tags: [Classes], security: [{ bearerAuth: [] }] }
 */
export const sectionsRouter = Router();
sectionsRouter.use(authenticate);
sectionsRouter.get('/', requirePermission(Permission.CLASS_READ), validate({ query: listSectionsQuerySchema }), c.listSectionsHandler);
sectionsRouter.post('/', requirePermission(Permission.CLASS_CREATE), validate({ body: createSectionSchema }), c.createSectionHandler);
sectionsRouter.get('/:id', requirePermission(Permission.CLASS_READ), validate({ params: idParamsSchema }), c.getSectionHandler);
sectionsRouter.patch(
  '/:id',
  requirePermission(Permission.CLASS_UPDATE),
  validate({ params: idParamsSchema, body: updateSectionSchema }),
  c.updateSectionHandler,
);
sectionsRouter.delete('/:id', requirePermission(Permission.CLASS_DELETE), validate({ params: idParamsSchema }), c.deleteSectionHandler);
