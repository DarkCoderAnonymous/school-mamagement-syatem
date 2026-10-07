import { z } from 'zod';

const name = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(40, 'Keep the name under 40 characters')
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} &'()\-/]*$/u, 'Use letters, numbers, spaces and & \' ( ) - / only');

const description = z.string().trim().max(200, 'Keep the description under 200 characters');

const permissions = z.array(z.string().min(1)).min(1, 'Pick at least one permission').max(100);

export const createRoleSchema = z.object({
  name,
  description: description.optional(),
  permissions,
});

export const updateRoleSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    permissions: permissions.optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.permissions !== undefined, {
    message: 'Nothing to update',
  });

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
