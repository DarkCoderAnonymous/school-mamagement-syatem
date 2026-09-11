import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { loginRateLimiter } from './login-rate-limit';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  selectSchoolSchema,
  switchSchoolSchema,
} from './auth.validation';
import {
  changePasswordHandler,
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  resetPasswordHandler,
  selectSchoolHandler,
  switchSchoolHandler,
} from './auth.controller';

const router = Router();

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Log in with email + password
 *     tags: [Auth]
 */
router.post('/login', loginRateLimiter, validate({ body: loginSchema }), loginHandler);

/**
 * @openapi
 * /auth/select-school:
 *   post:
 *     summary: Finish a login for a user who belongs to several schools
 *     description: >
 *       Takes the short-lived selectionToken returned by /auth/login when it
 *       responded with kind="select-school", plus the chosen schoolId, and
 *       issues the real token pair. Rate-limited alongside login because it
 *       completes an authentication.
 *     tags: [Auth]
 */
router.post(
  '/select-school',
  loginRateLimiter,
  validate({ body: selectSchoolSchema }),
  selectSchoolHandler,
);

/**
 * @openapi
 * /auth/switch-school:
 *   post:
 *     summary: Move the current session to another of the user's schools
 *     description: >
 *       Issues a fresh token pair bound to the target membership and revokes
 *       the current refresh token. No permission is required: this is
 *       self-service over memberships the caller already holds, and the
 *       target membership is re-verified server-side.
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/switch-school',
  authenticate,
  validate({ body: switchSchoolSchema }),
  switchSchoolHandler,
);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Rotate the refresh token and issue a new access token
 *     tags: [Auth]
 */
router.post('/refresh', refreshHandler);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Revoke the current refresh token
 *     tags: [Auth]
 */
router.post('/logout', logoutHandler);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 */
router.post('/forgot-password', validate({ body: forgotPasswordSchema }), forgotPasswordHandler);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: Reset a password using a reset token
 *     tags: [Auth]
 */
router.post('/reset-password', validate({ body: resetPasswordSchema }), resetPasswordHandler);

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     summary: Change the current user's password
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/change-password', authenticate, validate({ body: changePasswordSchema }), changePasswordHandler);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get the current user, school, and resolved permissions
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me', authenticate, meHandler);

export default router;
