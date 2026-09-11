import { z } from 'zod';

export const submitRegistrationSchema = z.object({
  schoolName: z.string().min(1),
  contactPerson: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  curriculum: z.string().optional(),
  expectedStudents: z.number().int().min(0).optional(),
  requestedPlanId: z.string().min(1),
  documents: z.array(z.object({ name: z.string().min(1), url: z.string().min(1) })).default([]),
});

export const registrationStatusQuerySchema = z.object({
  email: z.string().email(),
});

export const registrationIdParamsSchema = z.object({ id: z.string().min(1) });

export const reviewRegistrationSchema = z.object({
  reviewNotes: z.string().optional(),
});

export const rejectRegistrationSchema = z.object({
  reviewNotes: z.string().min(1, 'A reason is required to reject an application'),
});

export type SubmitRegistrationInput = z.infer<typeof submitRegistrationSchema>;
