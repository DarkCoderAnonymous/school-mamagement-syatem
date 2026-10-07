import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

/**
 * For the platform console (`/admin/*`): endpoints that act across every
 * school, so a caller acting through a school membership is refused whatever
 * permissions it holds.
 *
 * Permission checks alone aren't enough here. `school.read` means "view your
 * school's profile" in a school role (SCHOOL_ADMIN, PRINCIPAL hold it), and
 * `School` is a platform collection the tenant plugin doesn't scope — so
 * `/admin/schools` behind `school.read` alone listed every school on the
 * platform to any school admin.
 */
export function requirePlatformAccount(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  if (req.user.membershipId) {
    next(AppError.forbidden('This is a platform console endpoint'));
    return;
  }
  next();
}
