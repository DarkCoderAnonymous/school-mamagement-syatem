import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * Refresh tokens are stored hashed (never plaintext) and rotated on every
 * use: `login`/`refresh` issue a new token + revoke the old one
 * (`revokedAt` set, `replacedByTokenHash` recorded) rather than deleting it,
 * so token-reuse (a sign of theft) can be detected.
 */
const refreshTokenSchema = createTenantSchema({
  // nullable to support platform-only SUPER_ADMIN accounts (see User.ts)
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: false, default: null, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /**
   * Which membership this token acts through (ADR-001). Null for a platform
   * SUPER_ADMIN. Switching schools issues a NEW token bound to the new
   * membership and revokes the old one — a token's audience never mutates.
   */
  membershipId: { type: Schema.Types.ObjectId, ref: 'SchoolMembership', default: null, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  replacedByTokenHash: { type: String, default: null },
  ip: { type: String },
  userAgent: { type: String },
});

export interface RefreshTokenDoc {
  _id: Types.ObjectId;
  schoolId?: Types.ObjectId | null;
  userId: Types.ObjectId;
  membershipId?: Types.ObjectId | null;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedByTokenHash?: string | null;
  ip?: string;
  userAgent?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const RefreshToken = model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);
