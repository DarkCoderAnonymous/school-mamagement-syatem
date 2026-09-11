import type { AuthUser, LoginRequest, LoginResponse, RefreshResponse } from '@sms/shared';
import { apiPost, apiGet } from './http';

export function login(input: LoginRequest): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/auth/login', input);
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
