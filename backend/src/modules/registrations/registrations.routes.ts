import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { registrationStatusQuerySchema, submitRegistrationSchema } from './registrations.validation';
import { registrationStatusHandler, submitRegistrationHandler } from './registrations.controller';

const router = Router();

/**
 * @openapi
 * /registrations:
 *   post:
 *     summary: Submit a school registration application (public)
 *     tags: [Registrations]
 */
router.post('/', validate({ body: submitRegistrationSchema }), submitRegistrationHandler);

/**
 * @openapi
 * /registrations/status:
 *   get:
 *     summary: Check an application's status by email (public)
 *     tags: [Registrations]
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema: { type: string }
 */
router.get('/status', validate({ query: registrationStatusQuerySchema }), registrationStatusHandler);

export default router;
