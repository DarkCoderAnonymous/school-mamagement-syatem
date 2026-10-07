import type { Request, Response } from 'express';
import { actorFrom } from '../../utils/actor';
import { ok } from '../../utils/response';
import * as service from './school-settings.service';
import type { UpdateSchoolSettingsInput } from './school-settings.validation';

export async function getSettingsHandler(_req: Request, res: Response): Promise<void> {
  ok(res, await service.getSchoolSettings());
}
export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateSchoolSettings(req.body as UpdateSchoolSettingsInput, actorFrom(req)));
}
