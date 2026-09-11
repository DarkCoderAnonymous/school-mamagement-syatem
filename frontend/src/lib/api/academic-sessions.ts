import { apiDelete, apiGet, apiGetPaginated, apiPatch, apiPost } from './http';
import type { AcademicSession } from './types';

export interface AcademicSessionInput {
  name: string;
  /** ISO date strings; the backend coerces and stores UTC. */
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export interface ListAcademicSessionsParams {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
  isCurrent?: string;
  /** apiGet takes a Record<string, unknown>; this keeps the named params assignable. */
  [key: string]: unknown;
}

export function listAcademicSessions(params: ListAcademicSessionsParams) {
  return apiGetPaginated<AcademicSession>('/academic-sessions', params);
}

/** Resolves to null when the school hasn't set one up yet — not an error. */
export function getCurrentAcademicSession(): Promise<AcademicSession | null> {
  return apiGet('/academic-sessions/current');
}

export function getAcademicSession(id: string): Promise<AcademicSession> {
  return apiGet(`/academic-sessions/${id}`);
}

export function createAcademicSession(input: AcademicSessionInput): Promise<AcademicSession> {
  return apiPost('/academic-sessions', input);
}

export function updateAcademicSession(
  id: string,
  input: Partial<AcademicSessionInput>,
): Promise<AcademicSession> {
  return apiPatch(`/academic-sessions/${id}`, input);
}

export function archiveAcademicSession(id: string): Promise<void> {
  return apiDelete(`/academic-sessions/${id}`);
}
