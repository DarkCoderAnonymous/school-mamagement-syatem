import { z } from 'zod';

/**
 * `endDate` after `startDate` is enforced here rather than in the service:
 * it's a property of the input shape, so rejecting it at the edge keeps the
 * service free to assume a coherent range.
 */
const dateRange = {
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
};

export const createAcademicSessionSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100),
    ...dateRange,
    isCurrent: z.boolean().default(false),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });

export const updateAcademicSessionSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    isCurrent: z.boolean().optional(),
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate > data.startDate, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });

export const academicSessionIdParamsSchema = z.object({ id: z.string().min(1) });

export const listAcademicSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().optional(),
  search: z.string().optional(),
  isCurrent: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type CreateAcademicSessionInput = z.infer<typeof createAcademicSessionSchema>;
export type UpdateAcademicSessionInput = z.infer<typeof updateAcademicSessionSchema>;
