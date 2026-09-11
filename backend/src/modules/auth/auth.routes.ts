import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { loginRateLimiter } from './login-rate-limit';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './auth.validation';
import {
  changePasswordHandler,
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  resetPasswordHandler,
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
