import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { TenantContext } from '../tenant/context';
import { assertTokenFresh } from '../services/auth-freshness.service';
import { apiUserLimiter } from './rateLimiter';
import type { AccessTokenPayload } from '../modules/auth/auth.types';
import type { Role } from '@sms/shared';

/**
 * The same secret also signs the short-lived select-school token, so a
 * verified signature alone doesn't make something an access token. Anything
 * carrying a `purpose`, or missing the claims an access token always has, is
 * refused here — cleanly, instead of crashing further down.
 */
function isAccessTokenPayload(decoded: unknown): decoded is AccessTokenPayload {
  if (typeof decoded !== 'object' || decoded === null) return false;
  const p = decoded as Record<string, unknown>;
  return (
    !('purpose' in p) &&
    typeof p.sub === 'string' &&
    Array.isArray(p.roles) &&
    Array.isArray(p.permissions) &&
    typeof p.permissionsEpoch === 'number'
  );
}

/**
 * While an account still has its temporary password, the only things it may
 * do are the self-service /auth calls (me, change-password, switch-school,
 * logout). Both clients already route such a person to the change-password
 * screen; this makes the server agree instead of trusting that.
 */
const AUTH_BASE_PATH = '/api/v1/auth';

/**
 * Verifies the access JWT, confirms it still reflects reality (ADR-005), and
 * runs the rest of the request inside the AsyncLocalStorage tenant context
 * that tenant.plugin.ts reads from — every scoped query downstream is
 * automatically filtered to req.user.schoolId (or unscoped for SUPER_ADMIN).
 *
 * The freshness check is what makes "remove this person's access" immediate
 * instead of "immediate within 15 minutes". It costs a Redis read fronted by
 * a 5-second in-process cache, not a database round trip.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(AppError.unauthorized('Missing bearer token'));
    return;
  }

  let payload: AccessTokenPayload;
  try {
    const decoded = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET);
    if (!isAccessTokenPayload(decoded)) {
      next(AppError.unauthorized('Invalid or expired token'));
      return;
    }
    payload = decoded;
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
    return;
  }

  assertTokenFresh(payload)
    .then(() => {
      if (payload.mustChangePassword && req.baseUrl !== AUTH_BASE_PATH) {
        throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Choose a new password before continuing');
      }
      req.user = payload;
      // Per-person request budget (middleware/rateLimiter.ts). Runs after the
      // token is proven, so it can be keyed on who is asking, not their IP.
      apiUserLimiter(req, res, (limiterErr?: unknown) => {
        if (limiterErr) {
          next(limiterErr);
          return;
        }
        TenantContext.run(
          {
            schoolId: payload.schoolId,
            userId: payload.sub,
            membershipId: payload.membershipId,
            role: (payload.roles[0] as Role | undefined) ?? null,
            isSuperAdmin: payload.isSuperAdmin,
            ip: req.ip,
          },
          () => next(),
        );
      });
    })
    .catch(next);
}
