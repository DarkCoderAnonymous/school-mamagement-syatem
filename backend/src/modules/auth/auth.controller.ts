import { Request, Response } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { refreshTokenTtlMs } from '../../utils/tokens';
import { noContent, ok } from '../../utils/response';
import * as authService from './auth.service';
import type { ChangePasswordInput, LoginInput, ResetPasswordInput } from './auth.validation';

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

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput, requestMeta(req));
  setRefreshCookie(res, result.refreshToken);
  ok(res, result);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const raw = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? (req.body?.refreshToken as string | undefined);
  if (!raw) throw AppError.unauthorized('Missing refresh token');

  const result = await authService.refresh(raw, requestMeta(req));
  setRefreshCookie(res, result.refreshToken);
  ok(res, result);
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const raw = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? (req.body?.refreshToken as string | undefined);
  await authService.logout(raw);
  clearRefreshCookie(res);
  noContent(res);
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const user = await authService.me(req.user!.sub);
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
  noContent(res);
}
