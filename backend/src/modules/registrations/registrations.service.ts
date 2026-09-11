import { Plan } from '../../models/Plan';
import { SchoolRegistration } from '../../models/SchoolRegistration';
import { AppError } from '../../utils/AppError';
import type { SubmitRegistrationInput } from './registrations.validation';

export async function submitRegistration(input: SubmitRegistrationInput) {
  const plan = await Plan.findOne({ _id: input.requestedPlanId, isActive: true });
  if (!plan) throw AppError.badRequest('requestedPlanId does not refer to an active plan');

  const existing = await SchoolRegistration.findOne({ email: input.email, status: { $ne: 'REJECTED' } });
  if (existing) {
    throw AppError.conflict('An application with this email is already pending or approved');
  }

  return SchoolRegistration.create(input);
}

export async function getRegistrationStatusByEmail(email: string) {
  const registration = await SchoolRegistration.findOne({ email }).sort({ createdAt: -1 }).lean();
  if (!registration) throw AppError.notFound('No application found for this email');

  return {
    schoolName: registration.schoolName,
    status: registration.status,
    reviewNotes: registration.status === 'REJECTED' ? registration.reviewNotes : undefined,
    submittedAt: registration.createdAt,
    reviewedAt: registration.reviewedAt,
  };
}
