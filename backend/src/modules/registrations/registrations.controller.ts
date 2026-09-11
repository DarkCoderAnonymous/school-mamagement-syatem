import { Request, Response } from 'express';
import { created, ok } from '../../utils/response';
import * as registrationsService from './registrations.service';
import type { SubmitRegistrationInput } from './registrations.validation';

export async function submitRegistrationHandler(req: Request, res: Response): Promise<void> {
  const registration = await registrationsService.submitRegistration(req.body as SubmitRegistrationInput);
  created(res, { id: registration._id, status: registration.status });
}

export async function registrationStatusHandler(req: Request, res: Response): Promise<void> {
  const status = await registrationsService.getRegistrationStatusByEmail(req.query.email as string);
  ok(res, status);
}
