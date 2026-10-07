import { z } from 'zod';
import { DEFAULT_SCHOOL_CURRENCY, SCHOOL_CURRENCY_CODES } from '@sms/shared';

// Caps are generous — well above any real school's details — and exist so a
// public, unauthenticated endpoint can't be used to park large documents in
// the database or flood the review queue with junk.
export const submitRegistrationSchema = z.object({
  schoolName: z.string().min(1).max(200),
  contactPerson: z.string().min(1).max(120),
  email: z.string().email().max(254),
  phone: z.string().min(1).max(40),
  address: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  curriculum: z.string().max(120).optional(),
  /** Defaults for clients that predate the currency picker. */
  currency: z.enum(SCHOOL_CURRENCY_CODES, { message: 'Choose a supported currency' }).default(DEFAULT_SCHOOL_CURRENCY),
  expectedStudents: z.number().int().min(0).max(1_000_000).optional(),
  requestedPlanId: z.string().min(1).max(64),
  documents: z
    .array(z.object({ name: z.string().min(1).max(200), url: z.string().min(1).max(2048) }))
    .max(20)
    .default([]),
});

export const registrationStatusQuerySchema = z.object({
  email: z.string().email().max(254),
});

export const registrationIdParamsSchema = z.object({ id: z.string().min(1) });

export const reviewRegistrationSchema = z.object({
  reviewNotes: z.string().optional(),
});

export const rejectRegistrationSchema = z.object({
  reviewNotes: z.string().min(1, 'A reason is required to reject an application'),
});

export type SubmitRegistrationInput = z.infer<typeof submitRegistrationSchema>;
