import { z } from 'zod';
import { listQueryBase, objectId } from '../../utils/query';

export const createClassSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  /** Defaults to the school's current session. */
  academicSessionId: objectId.optional(),
  order: z.coerce.number().int().min(0).max(999).default(0),
});

export const updateClassSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  order: z.coerce.number().int().min(0).max(999).optional(),
});

export const listClassesQuerySchema = z.object({
  ...listQueryBase,
  academicSessionId: objectId.optional(),
});

export const createSectionSchema = z.object({
  classId: objectId,
  name: z.string().trim().min(1, 'Name is required').max(30),
  capacity: z.coerce.number().int().min(1).max(500).default(40),
  room: z.string().trim().max(60).optional(),
  classTeacherId: objectId.nullable().optional(),
});

export const updateSectionSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
  room: z.string().trim().max(60).optional(),
  classTeacherId: objectId.nullable().optional(),
});

export const listSectionsQuerySchema = z.object({
  ...listQueryBase,
  classId: objectId.optional(),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
