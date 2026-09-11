import { z } from 'zod';

const limitsSchema = z.object({
  students: z.number().int().min(0),
  staff: z.number().int().min(0),
  storageMb: z.number().int().min(0).default(1024),
  smsCredits: z.number().int().min(0).default(0),
});

export const createPlanSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3).default('USD'),
  billingCycle: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']).default('MONTHLY'),
  limits: limitsSchema,
  enabledModules: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const updatePlanSchema = createPlanSchema.partial();

export const planIdParamsSchema = z.object({ id: z.string().min(1) });

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
