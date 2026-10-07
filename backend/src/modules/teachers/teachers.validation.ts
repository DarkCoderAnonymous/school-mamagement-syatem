import { z } from 'zod';
import { EMPLOYEE_STATUSES } from '../../models/Employee';
import { listQueryBase, objectId } from '../../utils/query';

const personFields = {
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  phone: z.string().trim().max(30).optional(),
  designation: z.string().trim().min(1).max(80),
  department: z.string().trim().max(80).optional(),
  joiningDate: z.coerce.date(),
  qualification: z.string().trim().max(120).optional(),
  specialization: z.string().trim().max(120).optional(),
  experienceYears: z.coerce.number().int().min(0).max(60).default(0),
  subjectIds: z.array(objectId).max(30).default([]),
};

export const createTeacherSchema = z.object({
  ...personFields,
  /** Becomes the teacher's sign-in; an existing account with this email is linked, not duplicated. */
  email: z.string().trim().email('Enter a valid email address').max(254),
  designation: personFields.designation.default('Teacher'),
  joiningDate: personFields.joiningDate.default(() => new Date()),
});

/** Email is the person's identity (ADR-001) and is not editable from a school's staff record. */
export const updateTeacherSchema = z.object({
  firstName: personFields.firstName.optional(),
  lastName: personFields.lastName.optional(),
  phone: personFields.phone,
  designation: personFields.designation.optional(),
  department: personFields.department,
  joiningDate: z.coerce.date().optional(),
  qualification: personFields.qualification,
  specialization: personFields.specialization,
  experienceYears: z.coerce.number().int().min(0).max(60).optional(),
  subjectIds: z.array(objectId).max(30).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
});

export const listTeachersQuerySchema = z.object({
  ...listQueryBase,
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  subjectId: objectId.optional(),
});

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;
