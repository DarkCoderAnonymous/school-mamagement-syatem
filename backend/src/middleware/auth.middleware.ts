import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { TenantContext } from '../tenant/context';
import { assertTokenFresh } from '../services/auth-freshness.service';
import type { AccessTokenPayload } from '../modules/auth/auth.types';
import type { Role } from '@sms/shared';

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
    payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
    return;
  }

  assertTokenFresh(payload)
    .then(() => {
      req.user = payload;
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
    })
    .catch(next);
}
