import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  SessionResponse,
} from '@sms/shared';
import { apiGet, apiPost } from './http';

/**
 * Resolves a PERSON, not a session (ADR-001). Check `result.kind`: a parent
 * with children at two schools gets `select-school` and no tokens, and must
 * choose first.
 */
export function login(input: LoginRequest): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/auth/login', input);
}

export function selectSchool(selectionToken: string, schoolId: string): Promise<SessionResponse> {
  return apiPost<SessionResponse>('/auth/select-school', { selectionToken, schoolId });
}

/**
 * Mobile has no cookie jar, so the refresh token goes in the body — the
 * backend needs it to revoke the session being switched away from.
 */
export function switchSchool(schoolId: string, refreshToken: string | null): Promise<SessionResponse> {
  return apiPost<SessionResponse>('/auth/switch-school', { schoolId, refreshToken });
}

export function refresh(refreshToken: string): Promise<RefreshResponse> {
  return apiPost<RefreshResponse>('/auth/refresh', { refreshToken });
}

export function logout(refreshToken: string | null): Promise<void> {
  return apiPost<void>('/auth/logout', { refreshToken });
}

export function me(): Promise<AuthUser> {
  return apiGet<AuthUser>('/auth/me');
}

export function forgotPassword(email: string): Promise<void> {
  return apiPost<void>('/auth/forgot-password', { email });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiPost<void>('/auth/change-password', { currentPassword, newPassword });
}
