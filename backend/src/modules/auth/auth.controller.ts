import { Request, Response } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { refreshTokenTtlMs } from '../../utils/tokens';
import { noContent, ok } from '../../utils/response';
import * as authService from './auth.service';
import type {
  ChangePasswordInput,
  LoginInput,
  ResetPasswordInput,
  SelectSchoolInput,
  SwitchSchoolInput,
} from './auth.validation';

const REFRESH_COOKIE = 'refreshToken';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: refreshTokenTtlMs(),
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

function readRefreshToken(req: Request): string | undefined {
  return (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? (req.body?.refreshToken as string | undefined);
}

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput, requestMeta(req));
  // A multi-school login issues no session yet, so there is no cookie to set —
  // the caller must choose a school first.
  if (result.kind === 'tokens') setRefreshCookie(res, result.refreshToken);
  ok(res, result);
}

export async function selectSchoolHandler(req: Request, res: Response): Promise<void> {
  const { selectionToken, schoolId } = req.body as SelectSchoolInput;
  const result = await authService.selectSchool(selectionToken, schoolId, requestMeta(req));
  setRefreshCookie(res, result.refreshToken);
  ok(res, result);
}

export async function switchSchoolHandler(req: Request, res: Response): Promise<void> {
  const { schoolId } = req.body as SwitchSchoolInput;
  const result = await authService.switchSchool(
    req.user!.sub,
    readRefreshToken(req),
    schoolId,
    requestMeta(req),
  );
  setRefreshCookie(res, result.refreshToken);
  ok(res, result);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const raw = readRefreshToken(req);
  if (!raw) throw AppError.unauthorized('Missing refresh token');

  const result = await authService.refresh(raw, requestMeta(req));
  setRefreshCookie(res, result.refreshToken);
  ok(res, result);
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  await authService.logout(readRefreshToken(req));
  clearRefreshCookie(res);
  noContent(res);
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const user = await authService.me(req.user!.sub, req.user!.membershipId);
  ok(res, user);
}

export async function forgotPasswordHandler(req: Request, res: Response): Promise<void> {
  await authService.forgotPassword(req.body.email as string);
  noContent(res);
}

export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  const { token, password } = req.body as ResetPasswordInput;
  await authService.resetPassword(token, password);
  noContent(res);
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  await authService.changePassword(req.user!.sub, currentPassword, newPassword);
  // Changing a password ends every session, including this one (ADR-005), so
  // the cookie must go too — otherwise the client holds a token it will be
  // rejected for using.
  clearRefreshCookie(res);
  noContent(res);
}
