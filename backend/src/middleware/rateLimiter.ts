import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * General-purpose limiter applied to the whole /auth/* surface, on top of the
 * stricter per-email login limiter. Deliberately backed by the in-memory
 * store: it is the backstop the per-email limiter fails open to when Redis is
 * unreachable (see modules/auth/login-rate-limit.ts).
 */
export const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests — try again later' },
    });
  },
});
