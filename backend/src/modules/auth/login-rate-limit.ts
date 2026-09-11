import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Request } from 'express';
import { redis } from '../../config/redis';

/** 5 attempts per email+IP per 15 minutes, per CLAUDE.md's login rules. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : 'unknown';
    // ipKeyGenerator normalizes IPv6 addresses (collapses the /64 subnet)
    // instead of keying on the full address, which would otherwise let an
    // IPv6 client hop addresses within its own subnet to dodge the limit.
    return `${ipKeyGenerator(req.ip ?? 'unknown')}:${email}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts — try again later' },
    });
  },
  store: new RedisStore({
    prefix: 'rl:login:',
    sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<unknown> as never,
  }),
  // A Redis outage must not take login down with it. Without this, a store
  // error propagates and every login attempt 500s (and before the connection
  // was bounded, hung outright). Failing open drops back to the in-memory
  // authRateLimiter applied to the whole /auth surface in app.ts, which is a
  // coarser but still real backstop against brute force.
  passOnStoreError: true,
});
