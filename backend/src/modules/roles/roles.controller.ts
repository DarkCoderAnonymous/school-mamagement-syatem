import type { Request, Response } from 'express';
import { actorFrom } from '../../utils/actor';
import { created, noContent, ok } from '../../utils/response';
import * as service from './roles.service';
import type { CreateRoleInput, UpdateRoleInput } from './roles.validation';

export function roleActorFrom(req: Request): service.RoleActor {
  return {
    ...actorFrom(req),
    membershipId: req.user!.membershipId,
    permissions: req.user!.permissions,
  };
}

export async function listRolesHandler(_req: Request, res: Response): Promise<void> {
  ok(res, await service.listRoles());
}
export async function listPermissionModulesHandler(_req: Request, res: Response): Promise<void> {
  ok(res, service.listPermissionModules());
}
export async function createRoleHandler(req: Request, res: Response): Promise<void> {
  created(res, await service.createRole(req.body as CreateRoleInput, roleActorFrom(req)));
}
export async function updateRoleHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateRole(req.params.id as string, req.body as UpdateRoleInput, roleActorFrom(req)));
}
export async function deleteRoleHandler(req: Request, res: Response): Promise<void> {
  await service.deleteRole(req.params.id as string, roleActorFrom(req));
  noContent(res);
}
