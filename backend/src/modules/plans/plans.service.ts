import { Plan } from '../../models/Plan';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { parsePaginationQuery } from '../../utils/paginate';
import type { CreatePlanInput, UpdatePlanInput } from './plans.validation';

export async function listPublicPlans() {
  return Plan.find({ isActive: true }).sort({ priceMinor: 1 }).lean();
}

export async function listPlans(query: Record<string, unknown>) {
  const { page, limit, skip, sort, search } = parsePaginationQuery(query);
  const filter = search ? { $or: [{ name: new RegExp(search, 'i') }, { code: new RegExp(search, 'i') }] } : {};

  const [items, total] = await Promise.all([
    Plan.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Plan.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function createPlan(input: CreatePlanInput) {
  return Plan.create(input);
}

export async function updatePlan(id: string, input: UpdatePlanInput) {
  const plan = await Plan.findByIdAndUpdate(id, input, { new: true });
  if (!plan) throw AppError.notFound('Plan not found');
  return plan;
}

export async function getPlanById(id: string) {
  const plan = await Plan.findById(id);
  if (!plan) throw AppError.notFound('Plan not found');
  return plan;
}
