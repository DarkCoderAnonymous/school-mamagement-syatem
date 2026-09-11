import { Request, Response } from 'express';
import { ok, paginated } from '../../../utils/response';
import * as service from './admin-schools.service';

export async function listSchoolsHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listSchools(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}

export async function getSchoolHandler(req: Request, res: Response): Promise<void> {
  const school = await service.getSchoolById(req.params.id as string);
  ok(res, school);
}

export async function updateSchoolStatusHandler(req: Request, res: Response): Promise<void> {
  const school = await service.updateSchoolStatus(req.params.id as string, req.body.status as string, {
    actorUserId: req.user!.sub,
    ip: req.ip,
  });
  ok(res, school);
}
