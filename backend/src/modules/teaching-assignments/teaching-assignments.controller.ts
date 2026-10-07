import type { Request, Response } from 'express';
import { actorFrom } from '../../utils/actor';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as service from './teaching-assignments.service';
import type { CreateAssignmentInput } from './teaching-assignments.validation';

export async function listAssignmentsHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listAssignments(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}
export async function myClassesHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.myClasses(req.user!.sub));
}
export async function teacherClassesHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.teacherClasses(req.params.id as string, (req.query as { academicSessionId?: string }).academicSessionId));
}
export async function createAssignmentHandler(req: Request, res: Response): Promise<void> {
  created(res, await service.createAssignment(req.body as CreateAssignmentInput, actorFrom(req)));
}
export async function deleteAssignmentHandler(req: Request, res: Response): Promise<void> {
  await service.deleteAssignment(req.params.id as string, actorFrom(req));
  noContent(res);
}
