import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { recordAudit } from '../utils/audit';

/**
 * A platform SUPER_ADMIN passes every permission check, and the tenant plugin
 * runs their queries unscoped — so each such request is a cross-school access
 * and is written to AuditLog (CLAUDE.md: "every cross-school read/write is
 * written to AuditLog"). One row per request however many guards it passes;
 * the path is recorded without its query string, which can carry personal
 * data (search terms, emails). A failed audit write is logged, not fatal:
 * it must not lock the platform operator out.
 */
async function auditSuperAdminAccess(req: Request, res: Response): Promise<void> {
  if (res.locals.superAdminAccessAudited) return;
  res.locals.superAdminAccessAudited = true;
  try {
    await recordAudit({
      schoolId: null,
      actorUserId: req.user!.sub,
      action: 'superadmin.access',
      entity: 'Request',
      ip: req.ip,
      isSuperAdminBypass: true,
      metadata: { method: req.method, path: `${req.baseUrl}${req.path === '/' ? '' : req.path}` },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to record super-admin access', err instanceof Error ? err.message : err);
  }
}

/** Guards check permission codes, never role names — see CLAUDE.md. */
export function requirePermission(code: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (req.user.isSuperAdmin) {
      void auditSuperAdminAccess(req, res).then(() => next());
      return;
    }
    if (req.user.permissions.includes(code)) {
      next();
      return;
    }
    next(AppError.forbidden(`Missing permission: ${code}`));
  };
}
