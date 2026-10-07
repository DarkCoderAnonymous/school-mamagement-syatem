import { z } from 'zod';
import { GENDERS, GUARDIAN_RELATIONS, STUDENT_STATUSES } from '../../models/Student';
import { listQueryBase, objectId } from '../../utils/query';

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const newGuardianFields = {
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  phone: z.string().trim().min(5, 'Phone number is required').max(30),
  email: z.string().trim().email('Enter a valid email address').max(254).optional().or(z.literal('')),
  occupation: optionalText(80),
  address: optionalText(300),
};

/**
 * A guardian on an admission is either an existing family contact (by id —
 * the second child of a family already enrolled) or a new one.
 */
const guardianLinkSchema = z.union([
  z.object({
    guardianId: objectId,
    relation: z.enum(GUARDIAN_RELATIONS),
    isPrimary: z.boolean().default(false),
  }),
  z.object({
    ...newGuardianFields,
    relation: z.enum(GUARDIAN_RELATIONS),
    isPrimary: z.boolean().default(false),
    /** Give this guardian a parent sign-in (needs an email). */
    createLogin: z.boolean().default(false),
  }),
]);

const guardiansSchema = z
  .array(guardianLinkSchema)
  .min(1, 'Add at least one parent or guardian')
  .max(4)
  .refine((g) => g.filter((x) => x.isPrimary).length <= 1, {
    message: 'Only one guardian can be the primary contact',
  })
  .refine((g) => g.every((x) => !('createLogin' in x) || !x.createLogin || !!x.email), {
    message: 'A guardian needs an email address to get a parent sign-in',
  });

const studentFields = {
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  dateOfBirth: z.coerce.date().refine((d) => d < new Date(), 'Date of birth must be in the past'),
  gender: z.enum(GENDERS),
  classId: objectId,
  sectionId: objectId,
  rollNumber: optionalText(20),
  admissionDate: z.coerce.date().optional(),
  address: optionalText(300),
  bloodGroup: optionalText(5),
  previousSchool: optionalText(120),
};

export const createStudentSchema = z.object({ ...studentFields, guardians: guardiansSchema });

export const updateStudentSchema = z.object({
  firstName: studentFields.firstName.optional(),
  lastName: studentFields.lastName.optional(),
  dateOfBirth: studentFields.dateOfBirth.optional(),
  gender: studentFields.gender.optional(),
  classId: objectId.optional(),
  sectionId: objectId.optional(),
  rollNumber: studentFields.rollNumber,
  admissionDate: studentFields.admissionDate,
  address: studentFields.address,
  bloodGroup: studentFields.bloodGroup,
  previousSchool: studentFields.previousSchool,
  status: z.enum(STUDENT_STATUSES).optional(),
  /** Replaces the student's guardian links when present. */
  guardians: guardiansSchema.optional(),
});

export const listStudentsQuerySchema = z.object({
  ...listQueryBase,
  classId: objectId.optional(),
  sectionId: objectId.optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
  gender: z.enum(GENDERS).optional(),
  guardianId: objectId.optional(),
});

export const updateGuardianSchema = z.object({
  firstName: newGuardianFields.firstName.optional(),
  lastName: newGuardianFields.lastName.optional(),
  phone: newGuardianFields.phone.optional(),
  email: newGuardianFields.email,
  occupation: newGuardianFields.occupation,
  address: newGuardianFields.address,
});

export const listGuardiansQuerySchema = z.object({ ...listQueryBase });

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type GuardianLinkInput = z.infer<typeof guardianLinkSchema>;
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;
