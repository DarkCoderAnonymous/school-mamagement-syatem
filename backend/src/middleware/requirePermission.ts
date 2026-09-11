import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

/** Guards check permission codes, never role names — see CLAUDE.md. */
export function requirePermission(code: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (req.user.isSuperAdmin || req.user.permissions.includes(code)) {
      next();
      return;
    }
    next(AppError.forbidden(`Missing permission: ${code}`));
  };
}
