import { z } from 'zod';

export const schoolIdParamsSchema = z.object({ id: z.string().min(1) });

export const listSchoolsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().optional(),
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'EXPIRED']).optional(),
});

export const updateSchoolStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'EXPIRED']),
});
