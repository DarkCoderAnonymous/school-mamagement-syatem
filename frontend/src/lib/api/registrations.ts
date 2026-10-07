import { apiGet, apiGetPaginated, apiPatch, apiPost } from './http';
import type { ApproveRegistrationResult, RegistrationStatusResult, SchoolRegistration } from './types';

export interface SubmitRegistrationInput {
  schoolName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  country?: string;
  curriculum?: string;
  /** ISO 4217, one of SCHOOL_CURRENCIES. */
  currency: string;
  expectedStudents?: number;
  requestedPlanId: string;
}

export function submitRegistration(input: SubmitRegistrationInput): Promise<{ id: string; status: string }> {
  return apiPost('/registrations', input);
}

export function getRegistrationStatus(email: string): Promise<RegistrationStatusResult> {
  return apiGet('/registrations/status', { email });
}

export function listRegistrations(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}) {
  return apiGetPaginated<SchoolRegistration>('/admin/registrations', params);
}

export function getRegistration(id: string): Promise<SchoolRegistration> {
  return apiGet(`/admin/registrations/${id}`);
}

export function reviewRegistration(id: string, reviewNotes?: string): Promise<SchoolRegistration> {
  return apiPatch(`/admin/registrations/${id}/review`, { reviewNotes });
}

export function approveRegistration(id: string): Promise<ApproveRegistrationResult> {
  return apiPost(`/admin/registrations/${id}/approve`);
}

export function rejectRegistration(id: string, reviewNotes: string): Promise<SchoolRegistration> {
  return apiPost(`/admin/registrations/${id}/reject`, { reviewNotes });
}
