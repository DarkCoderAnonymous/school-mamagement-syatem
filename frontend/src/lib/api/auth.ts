import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  SessionResponse,
} from '@sms/shared';
import { apiPost, apiGet } from './http';

/**
 * Resolves a PERSON, not a session (ADR-001). Check `result.kind`: a user who
 * belongs to more than one school gets `select-school` and NO tokens, and must
 * choose before a session exists.
 */
export function login(input: LoginRequest): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/auth/login', input);
}

/** Second half of a multi-school login. */
export function selectSchool(selectionToken: string, schoolId: string): Promise<SessionResponse> {
  return apiPost<SessionResponse>('/auth/select-school', { selectionToken, schoolId });
}

/** Moves an active session to another of the user's schools. */
export function switchSchool(schoolId: string): Promise<SessionResponse> {
  return apiPost<SessionResponse>('/auth/switch-school', { schoolId });
}

/** Silent session bootstrap on app load — relies on the httpOnly refresh cookie. */
export function refresh(): Promise<RefreshResponse> {
  return apiPost<RefreshResponse>('/auth/refresh');
}

export function logout(): Promise<void> {
  return apiPost<void>('/auth/logout');
}

export function me(): Promise<AuthUser> {
  return apiGet<AuthUser>('/auth/me');
}

export function forgotPassword(email: string): Promise<void> {
  return apiPost<void>('/auth/forgot-password', { email });
}

export function resetPassword(token: string, password: string): Promise<void> {
  return apiPost<void>('/auth/reset-password', { token, password });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiPost<void>('/auth/change-password', { currentPassword, newPassword });
}
