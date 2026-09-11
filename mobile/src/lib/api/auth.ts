import type { AuthUser, LoginRequest, LoginResponse, RefreshResponse } from '@sms/shared';
import { apiGet, apiPost } from './http';

export function login(input: LoginRequest): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/auth/login', input);
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
