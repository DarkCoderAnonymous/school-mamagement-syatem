import { Router } from 'express';
import { listPublicPlansHandler } from './plans.controller';

const router = Router();

/**
 * @openapi
 * /plans:
 *   get:
 *     summary: List active subscription plans (public)
 *     tags: [Plans]
 *     responses:
 *       200:
 *         description: List of active plans
 */
router.get('/', listPublicPlansHandler);

export default router;
