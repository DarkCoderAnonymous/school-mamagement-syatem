import { Schema, model, Types } from 'mongoose';
import { createPlatformSchema } from './base';

/**
 * The PERSON — global, not tenant-owned (ADR-001).
 *
 * Identity and tenancy used to be the same record: `User` carried `schoolId`
 * and uniqueness was `{ schoolId, email }`, so one person at two schools was
 * two rows with two passwords. Tenancy now lives on `SchoolMembership`, one
 * row per (person, school), and this document holds only what belongs to the
 * human: credential, name, contact, account status.
 *
 * Because it is global it uses `createPlatformSchema` — the tenant plugin is
 * deliberately NOT applied. Listing "users at a school" therefore goes through
 * SchoolMembership (which IS tenant-scoped), never through this collection.
 */
const userSchema = createPlatformSchema({
  email: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  /**
   * Platform-level roles, held by accounts that belong to no school — today
   * only SUPER_ADMIN. A person with school roles holds them on their
   * membership instead, so this array is empty for ordinary users.
   */
  platformRoleIds: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
  /** Account-wide: DISABLED means this person cannot sign in anywhere. */
  status: { type: String, enum: ['INVITED', 'ACTIVE', 'DISABLED'], default: 'ACTIVE' },
  mustChangePassword: { type: Boolean, default: false },
  lastLoginAt: { type: Date },
  passwordResetTokenHash: { type: String, default: null },
  passwordResetExpiresAt: { type: Date, default: null },
  /**
   * Hard session revocation (ADR-005). Access tokens issued before this
   * instant are rejected outright and refresh tokens are revoked. Set on
   * account disable, password change, and suspected compromise — the blunt
   * instrument, as distinct from the permission epoch's silent refresh.
   */
  sessionsValidFrom: { type: Date, default: null },
});

// Email identifies the person platform-wide now, not per school.
userSchema.index({ email: 1 }, { unique: true });

export type UserStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  platformRoleIds: Types.ObjectId[];
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt?: Date | null;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
  sessionsValidFrom?: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const User = model<UserDoc>('User', userSchema);
