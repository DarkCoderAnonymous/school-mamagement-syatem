import type { Request, Response } from 'express';
import { actorFrom } from '../../utils/actor';
import { roleActorFrom } from '../roles/roles.controller';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as service from './teachers.service';
import type { CreateTeacherInput, UpdateTeacherInput } from './teachers.validation';

export async function listTeachersHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listTeachers(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}
export async function getTeacherHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getTeacherById(req.params.id as string));
}
export async function createTeacherHandler(req: Request, res: Response): Promise<void> {
  created(res, await service.createTeacher(req.body as CreateTeacherInput, roleActorFrom(req)));
}
export async function updateTeacherHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateTeacher(req.params.id as string, req.body as UpdateTeacherInput, roleActorFrom(req)));
}
export async function deleteTeacherHandler(req: Request, res: Response): Promise<void> {
  await service.deleteTeacher(req.params.id as string, actorFrom(req));
  noContent(res);
}
