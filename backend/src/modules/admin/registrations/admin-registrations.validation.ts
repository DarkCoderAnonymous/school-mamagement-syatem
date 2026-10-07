import { z } from 'zod';

export { registrationIdParamsSchema, reviewRegistrationSchema, rejectRegistrationSchema } from '../../registrations/registrations.validation';

export const listRegistrationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().optional(),
  search: z.string().max(100).optional(),
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED']).optional(),
});
