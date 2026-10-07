import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema } from '../../utils/query';
import * as c from './members.controller';
import {
  inviteMemberSchema,
  listMembersQuerySchema,
  updateMemberRolesSchema,
  updateMemberStatusSchema,
} from './members.validation';

/**
 * @openapi
 * /members:
 *   get: { summary: List staff accounts at this school, tags: [Staff & roles], security: [{ bearerAuth: [] }] }
 *   post: { summary: Invite a staff member with one or more roles, tags: [Staff & roles], security: [{ bearerAuth: [] }] }
 * /members/{id}:
 *   get: { summary: Get a staff account, tags: [Staff & roles], security: [{ bearerAuth: [] }] }
 * /members/{id}/roles:
 *   patch: { summary: "Replace a staff member's roles", tags: [Staff & roles], security: [{ bearerAuth: [] }] }
 * /members/{id}/status:
 *   patch: { summary: "Enable or disable a staff member's access to this school", tags: [Staff & roles], security: [{ bearerAuth: [] }] }
 */
export const membersRouter = Router();
membersRouter.use(authenticate);
membersRouter.get('/', requirePermission(Permission.USER_READ), validate({ query: listMembersQuerySchema }), c.listMembersHandler);
membersRouter.post(
  '/',
  requirePermission(Permission.USER_CREATE),
  requirePermission(Permission.ROLE_ASSIGN),
  validate({ body: inviteMemberSchema }),
  c.inviteMemberHandler,
);
membersRouter.get('/:id', requirePermission(Permission.USER_READ), validate({ params: idParamsSchema }), c.getMemberHandler);
membersRouter.patch(
  '/:id/roles',
  requirePermission(Permission.ROLE_ASSIGN),
  validate({ params: idParamsSchema, body: updateMemberRolesSchema }),
  c.updateMemberRolesHandler,
);
membersRouter.patch(
  '/:id/status',
  requirePermission(Permission.USER_UPDATE),
  validate({ params: idParamsSchema, body: updateMemberStatusSchema }),
  c.updateMemberStatusHandler,
);
