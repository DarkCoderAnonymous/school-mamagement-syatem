import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../../middleware/auth.middleware';
import { requirePermission } from '../../../middleware/requirePermission';
import { requirePlatformAccount } from '../../../middleware/requirePlatformAccount';
import { validate } from '../../../middleware/validate.middleware';
import { listSchoolsQuerySchema, schoolIdParamsSchema, updateSchoolStatusSchema } from './admin-schools.validation';
import { getSchoolHandler, listSchoolsHandler, updateSchoolStatusHandler } from './admin-schools.controller';

const router = Router();

router.use(authenticate, requirePlatformAccount, requirePermission(Permission.SCHOOL_READ));

/**
 * @openapi
 * /admin/schools:
 *   get:
 *     summary: List schools with plan/subscription/user counts (Super Admin)
 *     tags: [Admin - Schools]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', validate({ query: listSchoolsQuerySchema }), listSchoolsHandler);

/**
 * @openapi
 * /admin/schools/{id}:
 *   get:
 *     summary: Get a school by id (Super Admin)
 *     tags: [Admin - Schools]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', validate({ params: schoolIdParamsSchema }), getSchoolHandler);

/**
 * @openapi
 * /admin/schools/{id}/status:
 *   patch:
 *     summary: Suspend or reactivate a school (Super Admin)
 *     tags: [Admin - Schools]
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/:id/status',
  requirePermission(Permission.SCHOOL_STATUS_UPDATE),
  validate({ params: schoolIdParamsSchema, body: updateSchoolStatusSchema }),
  updateSchoolStatusHandler,
);

export default router;
