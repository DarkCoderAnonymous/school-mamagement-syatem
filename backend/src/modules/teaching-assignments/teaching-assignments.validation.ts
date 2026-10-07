import { z } from 'zod';
import { listQueryBase, objectId } from '../../utils/query';

export const listAssignmentsQuerySchema = z.object({
  ...listQueryBase,
  /** Defaults to the current session. */
  academicSessionId: objectId.optional(),
  teacherId: objectId.optional(),
  classId: objectId.optional(),
  sectionId: objectId.optional(),
  subjectId: objectId.optional(),
});

/** One teacher's classes; defaults to the current session. */
export const teacherClassesQuerySchema = z.object({ academicSessionId: objectId.optional() });

export const createAssignmentSchema = z.object({
  teacherId: objectId,
  sectionId: objectId,
  subjectId: objectId,
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
