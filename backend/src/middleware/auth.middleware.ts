import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { TenantContext } from '../tenant/context';
import type { AccessTokenPayload } from '../modules/auth/auth.types';
import type { Role } from '@sms/shared';

/**
 * Verifies the access JWT and runs the rest of the request inside the
 * AsyncLocalStorage tenant context that tenant.plugin.ts reads from — every
 * scoped query downstream of this middleware is automatically filtered to
 * req.user.schoolId (or unscoped for SUPER_ADMIN).
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

  req.user = payload;
  TenantContext.run(
    {
      schoolId: payload.schoolId,
      userId: payload.sub,
      role: (payload.roles[0] as Role | undefined) ?? null,
      isSuperAdmin: payload.isSuperAdmin,
      ip: req.ip,
    },
    () => next(),
  );
}
