import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import {
  academicSessionIdParamsSchema,
  createAcademicSessionSchema,
  listAcademicSessionsQuerySchema,
  updateAcademicSessionSchema,
} from './academic-sessions.validation';
import {
  createAcademicSessionHandler,
  deleteAcademicSessionHandler,
  getAcademicSessionHandler,
  getCurrentAcademicSessionHandler,
  listAcademicSessionsHandler,
  updateAcademicSessionHandler,
} from './academic-sessions.controller';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /academic-sessions:
 *   get:
 *     summary: List academic sessions (paginated)
 *     tags: [Academic sessions]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: Create an academic session
 *     tags: [Academic sessions]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  requirePermission(Permission.SESSION_READ),
  validate({ query: listAcademicSessionsQuerySchema }),
  listAcademicSessionsHandler,
);
router.post(
  '/',
  requirePermission(Permission.SESSION_CREATE),
  validate({ body: createAcademicSessionSchema }),
  createAcademicSessionHandler,
);

/**
 * @openapi
 * /academic-sessions/current:
 *   get:
 *     summary: The school's current academic session, or null if none is set
 *     tags: [Academic sessions]
 *     security: [{ bearerAuth: [] }]
 */
// Declared before /:id so "current" isn't swallowed as an id.
router.get('/current', requirePermission(Permission.SESSION_READ), getCurrentAcademicSessionHandler);

/**
 * @openapi
 * /academic-sessions/{id}:
 *   get:
 *     summary: Get an academic session by id
 *     tags: [Academic sessions]
 *     security: [{ bearerAuth: [] }]
 *   patch:
 *     summary: Update an academic session
 *     tags: [Academic sessions]
 *     security: [{ bearerAuth: [] }]
 *   delete:
 *     summary: Archive an academic session (soft delete)
 *     tags: [Academic sessions]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/:id',
  requirePermission(Permission.SESSION_READ),
  validate({ params: academicSessionIdParamsSchema }),
  getAcademicSessionHandler,
);
router.patch(
  '/:id',
  requirePermission(Permission.SESSION_UPDATE),
  validate({ params: academicSessionIdParamsSchema, body: updateAcademicSessionSchema }),
  updateAcademicSessionHandler,
);
router.delete(
  '/:id',
  requirePermission(Permission.SESSION_DELETE),
  validate({ params: academicSessionIdParamsSchema }),
  deleteAcademicSessionHandler,
);

export default router;
