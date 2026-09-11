import { Request, Response } from 'express';
import { ok, created, paginated } from '../../utils/response';
import * as plansService from './plans.service';
import type { CreatePlanInput, UpdatePlanInput } from './plans.validation';

export async function listPublicPlansHandler(_req: Request, res: Response): Promise<void> {
  const plans = await plansService.listPublicPlans();
  ok(res, plans);
}

export async function listPlansHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await plansService.listPlans(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}

export async function getPlanHandler(req: Request, res: Response): Promise<void> {
  const plan = await plansService.getPlanById(req.params.id as string);
  ok(res, plan);
}

export async function createPlanHandler(req: Request, res: Response): Promise<void> {
  const plan = await plansService.createPlan(req.body as CreatePlanInput);
  created(res, plan);
}

export async function updatePlanHandler(req: Request, res: Response): Promise<void> {
  const plan = await plansService.updatePlan(req.params.id as string, req.body as UpdatePlanInput);
  ok(res, plan);
}
