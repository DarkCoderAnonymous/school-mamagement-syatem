import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { AccessTokenPayload } from '../modules/auth/auth.types';

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL } as jwt.SignOptions);
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
