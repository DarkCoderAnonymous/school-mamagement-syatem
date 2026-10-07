import { z } from 'zod';
import { listQueryBase } from '../../utils/query';

const code = z
  .string()
  .trim()
  .min(1, 'Code is required')
  .max(12)
  .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only');

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  code,
  isElective: z.boolean().default(false),
  description: z.string().trim().max(300).optional(),
});

export const updateSubjectSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  code: code.optional(),
  isElective: z.boolean().optional(),
  description: z.string().trim().max(300).optional(),
});

export const listSubjectsQuerySchema = z.object({
  ...listQueryBase,
  isElective: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
