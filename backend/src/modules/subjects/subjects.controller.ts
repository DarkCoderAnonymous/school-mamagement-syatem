import type { Request, Response } from 'express';
import { actorFrom } from '../../utils/actor';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as service from './subjects.service';
import type { CreateSubjectInput, UpdateSubjectInput } from './subjects.validation';

export async function listSubjectsHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listSubjects(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}
export async function getSubjectHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getSubjectById(req.params.id as string));
}
export async function createSubjectHandler(req: Request, res: Response): Promise<void> {
  created(res, await service.createSubject(req.body as CreateSubjectInput, actorFrom(req)));
}
export async function updateSubjectHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateSubject(req.params.id as string, req.body as UpdateSubjectInput, actorFrom(req)));
}
export async function deleteSubjectHandler(req: Request, res: Response): Promise<void> {
  await service.deleteSubject(req.params.id as string, actorFrom(req));
  noContent(res);
}
