import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import * as c from './school-settings.controller';
import { updateSchoolSettingsSchema } from './school-settings.validation';

/**
 * The caller's own school — never another one: there is no id in the path.
 *
 * @openapi
 * /school-settings:
 *   get: { summary: "Your school's settings (theme, currency)", tags: [School settings], security: [{ bearerAuth: [] }] }
 *   patch: { summary: "Change your school's accent palette", tags: [School settings], security: [{ bearerAuth: [] }] }
 */
const router = Router();
router.use(authenticate);
router.get('/', requirePermission(Permission.SCHOOL_READ), c.getSettingsHandler);
router.patch('/', requirePermission(Permission.SCHOOL_UPDATE), validate({ body: updateSchoolSettingsSchema }), c.updateSettingsHandler);

export default router;
