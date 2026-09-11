import { Request, Response } from 'express';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as service from './academic-sessions.service';
import type {
  CreateAcademicSessionInput,
  UpdateAcademicSessionInput,
} from './academic-sessions.validation';

/** Controllers stay thin: parse, call the service, respond (CLAUDE.md). */
function actorFrom(req: Request): service.ActorMeta {
  return {
    actorUserId: req.user!.sub,
    schoolId: req.user!.schoolId,
    ip: req.ip,
  };
}

export async function listAcademicSessionsHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listAcademicSessions(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}

export async function getCurrentAcademicSessionHandler(_req: Request, res: Response): Promise<void> {
  // Null rather than 404: "no session configured yet" is the expected state
  // for a school on day one, and the dashboard branches on it.
  ok(res, await service.getCurrentAcademicSession());
}

export async function getAcademicSessionHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getAcademicSessionById(req.params.id as string));
}

export async function createAcademicSessionHandler(req: Request, res: Response): Promise<void> {
  const result = await service.createAcademicSession(
    req.body as CreateAcademicSessionInput,
    actorFrom(req),
  );
  created(res, result);
}

export async function updateAcademicSessionHandler(req: Request, res: Response): Promise<void> {
  const result = await service.updateAcademicSession(
    req.params.id as string,
    req.body as UpdateAcademicSessionInput,
    actorFrom(req),
  );
  ok(res, result);
}

export async function deleteAcademicSessionHandler(req: Request, res: Response): Promise<void> {
  await service.deleteAcademicSession(req.params.id as string, actorFrom(req));
  noContent(res);
}
