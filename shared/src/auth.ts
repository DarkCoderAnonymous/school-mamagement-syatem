import { z } from 'zod';
import type { MembershipSummary } from './membership';

/**
 * Auth request/response DTOs shared by backend, web, and mobile so the
 * three apps can't drift on the login/me contract.
 */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Null only for a platform SUPER_ADMIN, who belongs to no school. */
  schoolId: string | null;
  /** Which membership this session is acting through (ADR-001). */
  membershipId: string | null;
  schoolName: string | null;
  schoolLogoUrl: string | null;
  schoolPrimaryColor: string | null;
  /** ISO 4217 code money is shown in for the active school; null for a platform SUPER_ADMIN. */
  schoolCurrency: string | null;
  /** The active school's accent palette (SCHOOL_THEMES key); null for a platform SUPER_ADMIN. */
  schoolTheme: string | null;
  /** Role names for the ACTIVE membership only. */
  roles: string[];
  /** Permissions for the ACTIVE membership only. */
  permissions: string[];
  mustChangePassword: boolean;
  /**
   * Every school this person can act as. Length > 1 means the client should
   * offer a switcher. Empty for a platform SUPER_ADMIN.
   */
  memberships: MembershipSummary[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Login resolves a PERSON, not a session, so it has two outcomes (ADR-001).
 *
 * `kind: 'tokens'` — exactly one place to act (or a platform super admin).
 * `kind: 'select-school'` — several memberships. No tokens are issued yet:
 * the caller must choose. `selectionToken` is short-lived and proves the
 * password was already verified, so /auth/select-school can't be called
 * with a guessed user id.
 *
 * Guessing a "default" school here is the bug this shape exists to prevent —
 * a parent silently shown the wrong child's attendance.
 */
export interface LoginTokensResult extends AuthTokens {
  kind: 'tokens';
  user: AuthUser;
}

export interface LoginSelectSchoolResult {
  kind: 'select-school';
  selectionToken: string;
  memberships: MembershipSummary[];
}

export type LoginResponse = LoginTokensResult | LoginSelectSchoolResult;

/** Rotation returns a new pair and nothing else — the caller already has the user. */
export type RefreshResponse = AuthTokens;

/** Response of /auth/select-school and /auth/switch-school. */
export interface SessionResponse extends AuthTokens {
  user: AuthUser;
}

/**
 * Distinct error codes the auth endpoints can return, so clients can show a
 * specific message instead of a generic "login failed".
 *
 * TOKEN_STALE and SESSION_REVOKED come from ADR-005: the first is routine
 * (permissions changed — refresh silently and retry), the second is
 * deliberate (the session was ended — sign in again).
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'SCHOOL_SUSPENDED'
  | 'SUBSCRIPTION_INACTIVE'
  | 'ACCOUNT_DISABLED'
  | 'NO_ACTIVE_MEMBERSHIP'
  | 'TOKEN_STALE'
  | 'SESSION_REVOKED'
  | 'TOO_MANY_REQUESTS';

/*
 * Zod schemas live here so backend validation and the web/mobile forms are
 * literally the same rules (master prompt, rule 9).
 */
export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const selectSchoolSchema = z.object({
  selectionToken: z.string().min(1),
  schoolId: z.string().min(1, 'Choose a school'),
});

export const switchSchoolSchema = z.object({
  schoolId: z.string().min(1, 'Choose a school'),
  /**
   * Optional because web sends the refresh token as an httpOnly cookie.
   * Mobile has no cookie jar, so it passes the token in the body — and it
   * must be declared here or validation strips it before the handler can
   * revoke the session being switched away from.
   */
  refreshToken: z.string().min(1).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const logoutSchema = refreshSchema;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SelectSchoolInput = z.infer<typeof selectSchoolSchema>;
export type SwitchSchoolInput = z.infer<typeof switchSchoolSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
