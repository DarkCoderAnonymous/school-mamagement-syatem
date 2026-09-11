import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './AppError';
import type { AccessTokenPayload, SelectionTokenPayload } from '../modules/auth/auth.types';

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL } as jwt.SignOptions);
}

/**
 * The token handed back when login resolves to a choice of schools. Five
 * minutes is enough to read a picker and not much else; it is signed with the
 * access secret but carries `purpose`, so it can never be mistaken for — or
 * used as — an access token.
 */
const SELECTION_TOKEN_TTL = '5m';

export function signSelectionToken(userId: string): string {
  const payload: SelectionTokenPayload = { sub: userId, purpose: 'select-school' };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: SELECTION_TOKEN_TTL });
}

export function verifySelectionToken(token: string): SelectionTokenPayload {
  let decoded: SelectionTokenPayload;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as SelectionTokenPayload;
  } catch {
    throw AppError.unauthorized('School selection expired — sign in again');
  }
  // Without this an ordinary access token would satisfy select-school.
  if (decoded.purpose !== 'select-school') {
    throw AppError.unauthorized('Invalid selection token');
  }
  return decoded;
}

/**
 * Refresh tokens are opaque random strings, never JWTs — the client holds
 * the raw value, the DB (RefreshToken.tokenHash) holds only its SHA-256
 * hash, so a DB leak alone can't be used to forge a session.
 */
export function generateOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function refreshTokenTtlMs(): number {
  const match = /^(\d+)([smhd])$/.exec(env.JWT_REFRESH_TTL);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * unitMs[match[2]!]!;
}

export function refreshTokenExpiryDate(): Date {
  return new Date(Date.now() + refreshTokenTtlMs());
}
