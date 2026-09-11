/**
 * Auth request/response DTOs shared by backend, web, and mobile so the
 * three apps can't drift on the login/me contract.
 */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  schoolId: string | null;
  schoolName: string | null;
  schoolLogoUrl: string | null;
  schoolPrimaryColor: string | null;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Distinct error codes the login/refresh endpoints can return, so clients
 * can show a specific message instead of a generic "login failed".
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'SCHOOL_SUSPENDED'
  | 'SUBSCRIPTION_INACTIVE'
  | 'ACCOUNT_DISABLED'
  | 'TOO_MANY_REQUESTS';
