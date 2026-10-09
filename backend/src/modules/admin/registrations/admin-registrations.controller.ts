import { Request, Response } from 'express';
import { ok, paginated } from '../../../utils/response';
import * as service from './admin-registrations.service';

function actorMeta(req: Request): service.ActorMeta {
  return { actorUserId: req.user!.sub, ip: req.ip };
}

export async function listRegistrationsHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listRegistrations(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}

export async function getRegistrationHandler(req: Request, res: Response): Promise<void> {
  const registration = await service.getRegistrationById(req.params.id as string);
  ok(res, registration);
}

export async function reviewRegistrationHandler(req: Request, res: Response): Promise<void> {
  const registration = await service.reviewRegistration(
    req.params.id as string,
    req.body.reviewNotes as string | undefined,
    actorMeta(req),
  );
  ok(res, registration);
}

export async function approveRegistrationHandler(req: Request, res: Response): Promise<void> {
  const result = await service.approveRegistration(req.params.id as string, actorMeta(req));
  ok(res, result);
}

export async function reissueAdminTempPasswordHandler(req: Request, res: Response): Promise<void> {
  const result = await service.reissueAdminTempPassword(req.params.id as string, actorMeta(req));
  ok(res, result);
}

export async function rejectRegistrationHandler(req: Request, res: Response): Promise<void> {
  const registration = await service.rejectRegistration(
    req.params.id as string,
    req.body.reviewNotes as string,
    actorMeta(req),
  );
  ok(res, registration);
}
