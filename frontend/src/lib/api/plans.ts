import { apiGet, apiGetPaginated, apiPatch, apiPost } from './http';
import type { Plan } from './types';

export function listPublicPlans(): Promise<Plan[]> {
  return apiGet('/plans');
}

export function listPlans(params: { page?: number; limit?: number; search?: string }) {
  return apiGetPaginated<Plan>('/admin/plans', params);
}

export function getPlan(id: string): Promise<Plan> {
  return apiGet(`/admin/plans/${id}`);
}

export interface PlanInput {
  name: string;
  code: string;
  description?: string;
  priceMinor: number;
  currency: string;
  billingCycle: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  limits: { students: number; staff: number; storageMb: number; smsCredits: number };
  enabledModules: string[];
  isActive: boolean;
}

export function createPlan(input: PlanInput): Promise<Plan> {
  return apiPost('/admin/plans', input);
}

export function updatePlan(id: string, input: Partial<PlanInput>): Promise<Plan> {
  return apiPatch(`/admin/plans/${id}`, input);
}
