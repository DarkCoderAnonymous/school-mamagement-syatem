import type { Request, Response } from 'express';
import { roleActorFrom } from '../roles/roles.controller';
import { created, ok, paginated } from '../../utils/response';
import * as service from './members.service';
import type { InviteMemberInput } from './members.validation';

export async function listMembersHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listMembers(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}
export async function getMemberHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getMemberById(req.params.id as string));
}
export async function inviteMemberHandler(req: Request, res: Response): Promise<void> {
  created(res, await service.inviteMember(req.body as InviteMemberInput, roleActorFrom(req)));
}
export async function updateMemberRolesHandler(req: Request, res: Response): Promise<void> {
  const { roleIds } = req.body as { roleIds: string[] };
  ok(res, await service.updateMemberRoles(req.params.id as string, roleIds, roleActorFrom(req)));
}
export async function updateMemberStatusHandler(req: Request, res: Response): Promise<void> {
  const { status } = req.body as { status: 'ACTIVE' | 'DISABLED' };
  ok(res, await service.updateMemberStatus(req.params.id as string, status, roleActorFrom(req)));
}
