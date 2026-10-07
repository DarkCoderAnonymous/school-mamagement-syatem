import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../../middleware/auth.middleware';
import { requirePermission } from '../../../middleware/requirePermission';
import { requirePlatformAccount } from '../../../middleware/requirePlatformAccount';
import { validate } from '../../../middleware/validate.middleware';
import {
  listRegistrationsQuerySchema,
  registrationIdParamsSchema,
  rejectRegistrationSchema,
  reviewRegistrationSchema,
} from './admin-registrations.validation';
import {
  approveRegistrationHandler,
  getRegistrationHandler,
  listRegistrationsHandler,
  rejectRegistrationHandler,
  reviewRegistrationHandler,
} from './admin-registrations.controller';

const router = Router();

router.use(authenticate, requirePlatformAccount);

/**
 * @openapi
 * /admin/registrations:
 *   get:
 *     summary: List school registration applications (Super Admin)
 *     tags: [Admin - Registrations]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  requirePermission(Permission.REGISTRATION_READ),
  validate({ query: listRegistrationsQuerySchema }),
  listRegistrationsHandler,
);

/**
 * @openapi
 * /admin/registrations/{id}:
 *   get:
 *     summary: Get a registration application by id (Super Admin)
 *     tags: [Admin - Registrations]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/:id',
  requirePermission(Permission.REGISTRATION_READ),
  validate({ params: registrationIdParamsSchema }),
  getRegistrationHandler,
);

/**
 * @openapi
 * /admin/registrations/{id}/review:
 *   patch:
 *     summary: Mark a registration as under review (Super Admin)
 *     tags: [Admin - Registrations]
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/:id/review',
  requirePermission(Permission.REGISTRATION_REVIEW),
  validate({ params: registrationIdParamsSchema, body: reviewRegistrationSchema }),
  reviewRegistrationHandler,
);

/**
 * @openapi
 * /admin/registrations/{id}/approve:
 *   post:
 *     summary: Approve a registration — atomically provisions the school (Super Admin)
 *     tags: [Admin - Registrations]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/:id/approve',
  requirePermission(Permission.REGISTRATION_APPROVE),
  validate({ params: registrationIdParamsSchema }),
  approveRegistrationHandler,
);

/**
 * @openapi
 * /admin/registrations/{id}/reject:
 *   post:
 *     summary: Reject a registration application (Super Admin)
 *     tags: [Admin - Registrations]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/:id/reject',
  requirePermission(Permission.REGISTRATION_REJECT),
  validate({ params: registrationIdParamsSchema, body: rejectRegistrationSchema }),
  rejectRegistrationHandler,
);

export default router;
