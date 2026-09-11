import { Schema, model, Types } from 'mongoose';
import { createPlatformSchema } from './base';

/**
 * Role is a DB collection (not a hardcoded enum) so schools can define
 * custom roles later. System roles (SUPER_ADMIN, SCHOOL_ADMIN, ACCOUNTANT,
 * EXAM_CONTROLLER, TEACHER, PARENT, STUDENT — from @sms/shared's Role enum)
 * are seeded with `schoolId: null`. A school may add its own custom roles
 * with its own schoolId.
 *
 * DESIGN CHOICE: Permission is embedded as an array of permission-key
 * strings on Role (`permissions: string[]`) rather than separate
 * Permission/RolePermission collections. The permission keys themselves come
 * from a single source of truth (src/rbac/permissions.catalog.ts). This
 * keeps effective-permission lookups to a single query (fetch the user's
 * roles, union their `permissions` arrays) instead of joins across three
 * collections, at the cost of a small migration if we ever need
 * per-permission metadata (we don't, today).
 *
 * Because schoolId can legitimately be null (system roles) this schema is
 * NOT run through the generic tenant-scoping plugin (which requires a
 * non-null schoolId for non-super-admins) — the role service scopes
 * queries manually as `{ $or: [{ schoolId: null }, { schoolId }] }` so a
 * school sees system roles + its own custom roles.
 */
const roleSchema = createPlatformSchema({
  name: { type: String, required: true, trim: true },
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  isSystem: { type: Boolean, default: false },
  permissions: { type: [String], default: [] },
  description: { type: String, trim: true },
});

roleSchema.index({ schoolId: 1, name: 1 }, { unique: true });

export interface RoleDoc {
  _id: Types.ObjectId;
  name: string;
  schoolId?: Types.ObjectId | null;
  isSystem: boolean;
  permissions: string[];
  description?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const RoleModel = model<RoleDoc>('Role', roleSchema);
