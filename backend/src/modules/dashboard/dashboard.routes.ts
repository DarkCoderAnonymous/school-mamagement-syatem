import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { ok } from '../../utils/response';
import { getDashboardSummary } from './dashboard.service';

/**
 * @openapi
 * /dashboard/summary:
 *   get: { summary: "Headline counts, limited to what the caller may read", tags: [Dashboard], security: [{ bearerAuth: [] }] }
 */
const router = Router();
router.use(authenticate);
// No requirePermission: the service includes only the blocks the caller can
// already read, so an account with no read permissions gets all-null blocks.
router.get('/summary', async (req: Request, res: Response) => {
  ok(res, await getDashboardSummary(req.user!.permissions));
});

export default router;
