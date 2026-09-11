import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * DESIGN CHOICE: roles are embedded as an array of Role ObjectIds directly
 * on User (`roles: ObjectId[]`) rather than a separate UserRole join
 * collection. A user's effective permissions = union of `Role.permissions`
 * for every role in `user.roles`. This is simpler to query (one populate)
 * at the cost of not being able to attach metadata to a single
 * user-role assignment (e.g. "assigned by X on date Y") — if that's ever
 * needed, promote this to a real UserRole collection.
 *
 * schoolId is overridden below to allow `null` (unlike other tenant
 * schemas) specifically so a genuine platform-only SUPER_ADMIN account can
 * exist without being owned by any school.
 */
const userSchema = createTenantSchema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: false, default: null, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  roles: [{ type: Schema.Types.ObjectId, ref: 'Role', required: true }],
  status: { type: String, enum: ['INVITED', 'ACTIVE', 'DISABLED'], default: 'ACTIVE' },
  mustChangePassword: { type: Boolean, default: false },
  lastLoginAt: { type: Date },
  passwordResetTokenHash: { type: String, default: null },
  passwordResetExpiresAt: { type: Date, default: null },
});

userSchema.index({ schoolId: 1, email: 1 }, { unique: true });

export type UserStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

export interface UserDoc {
  _id: Types.ObjectId;
  schoolId?: Types.ObjectId | null;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roles: Types.ObjectId[];
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt?: Date | null;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const User = model<UserDoc>('User', userSchema);
