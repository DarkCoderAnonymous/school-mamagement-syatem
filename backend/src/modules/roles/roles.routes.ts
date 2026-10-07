import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema } from '../../utils/query';
import * as c from './roles.controller';
import { createRoleSchema, updateRoleSchema } from './roles.validation';

/**
 * @openapi
 * /roles:
 *   get: { summary: "The school's roles, with permissions and member counts", tags: [Staff & roles], security: [{ bearerAuth: [] }] }
 *   post: { summary: "Create a custom role from permissions you hold", tags: [Staff & roles], security: [{ bearerAuth: [] }] }
 * /roles/permissions:
 *   get: { summary: "Permissions a custom role can include, grouped by module", tags: [Staff & roles], security: [{ bearerAuth: [] }] }
 * /roles/{id}:
 *   patch: { summary: "Rename a custom role or change its permissions", tags: [Staff & roles], security: [{ bearerAuth: [] }] }
 *   delete: { summary: "Delete a custom role nobody holds", tags: [Staff & roles], security: [{ bearerAuth: [] }] }
 */
export const rolesRouter = Router();
rolesRouter.use(authenticate);
rolesRouter.get('/', requirePermission(Permission.USER_READ), c.listRolesHandler);
rolesRouter.get('/permissions', requirePermission(Permission.ROLE_MANAGE), c.listPermissionModulesHandler);
rolesRouter.post('/', requirePermission(Permission.ROLE_MANAGE), validate({ body: createRoleSchema }), c.createRoleHandler);
rolesRouter.patch(
  '/:id',
  requirePermission(Permission.ROLE_MANAGE),
  validate({ params: idParamsSchema, body: updateRoleSchema }),
  c.updateRoleHandler,
);
rolesRouter.delete('/:id', requirePermission(Permission.ROLE_MANAGE), validate({ params: idParamsSchema }), c.deleteRoleHandler);
