import type { Request, Response } from 'express';
import { actorFrom } from '../../utils/actor';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as service from './classes.service';
import type {
  CreateClassInput,
  CreateSectionInput,
  UpdateClassInput,
  UpdateSectionInput,
} from './classes.validation';

export async function listClassesHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listClasses(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}
export async function getClassHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getClassById(req.params.id as string));
}
export async function createClassHandler(req: Request, res: Response): Promise<void> {
  created(res, await service.createClass(req.body as CreateClassInput, actorFrom(req)));
}
export async function updateClassHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateClass(req.params.id as string, req.body as UpdateClassInput, actorFrom(req)));
}
export async function deleteClassHandler(req: Request, res: Response): Promise<void> {
  await service.deleteClass(req.params.id as string, actorFrom(req));
  noContent(res);
}

export async function listSectionsHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listSections(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}
export async function getSectionHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getSectionById(req.params.id as string));
}
export async function createSectionHandler(req: Request, res: Response): Promise<void> {
  created(res, await service.createSection(req.body as CreateSectionInput, actorFrom(req)));
}
export async function updateSectionHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateSection(req.params.id as string, req.body as UpdateSectionInput, actorFrom(req)));
}
export async function deleteSectionHandler(req: Request, res: Response): Promise<void> {
  await service.deleteSection(req.params.id as string, actorFrom(req));
  noContent(res);
}
