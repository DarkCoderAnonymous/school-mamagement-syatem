import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { requirePlatformAccount } from '../../middleware/requirePlatformAccount';
import { validate } from '../../middleware/validate.middleware';
import { createPlanSchema, listPlansQuerySchema, planIdParamsSchema, updatePlanSchema } from './plans.validation';
import { createPlanHandler, getPlanHandler, listPlansHandler, updatePlanHandler } from './plans.controller';

const router = Router();

router.use(authenticate, requirePlatformAccount, requirePermission(Permission.PLAN_MANAGE));

/**
 * @openapi
 * /admin/plans:
 *   get:
 *     summary: List all plans (Super Admin)
 *     tags: [Admin - Plans]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: Create a plan (Super Admin)
 *     tags: [Admin - Plans]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', validate({ query: listPlansQuerySchema }), listPlansHandler);
router.post('/', validate({ body: createPlanSchema }), createPlanHandler);

/**
 * @openapi
 * /admin/plans/{id}:
 *   get:
 *     summary: Get a plan by id (Super Admin)
 *     tags: [Admin - Plans]
 *     security: [{ bearerAuth: [] }]
 *   patch:
 *     summary: Update a plan (Super Admin)
 *     tags: [Admin - Plans]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', validate({ params: planIdParamsSchema }), getPlanHandler);
router.patch('/:id', validate({ params: planIdParamsSchema, body: updatePlanSchema }), updatePlanHandler);

export default router;
