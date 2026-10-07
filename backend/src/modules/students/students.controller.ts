import type { Request, Response } from 'express';
import { actorFrom } from '../../utils/actor';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as service from './students.service';
import type { CreateStudentInput, UpdateGuardianInput, UpdateStudentInput } from './students.validation';

export async function listStudentsHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listStudents(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}
export async function getStudentHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getStudentById(req.params.id as string));
}
export async function createStudentHandler(req: Request, res: Response): Promise<void> {
  created(res, await service.createStudent(req.body as CreateStudentInput, actorFrom(req)));
}
export async function updateStudentHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateStudent(req.params.id as string, req.body as UpdateStudentInput, actorFrom(req)));
}
export async function deleteStudentHandler(req: Request, res: Response): Promise<void> {
  await service.deleteStudent(req.params.id as string, actorFrom(req));
  noContent(res);
}

export async function listGuardiansHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listGuardians(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}
export async function getGuardianHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getGuardianById(req.params.id as string));
}
export async function updateGuardianHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateGuardian(req.params.id as string, req.body as UpdateGuardianInput, actorFrom(req)));
}
