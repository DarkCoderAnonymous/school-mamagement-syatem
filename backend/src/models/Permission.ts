import { model, Types } from 'mongoose';
import { createPlatformSchema } from './base';

/**
 * Read-only catalogue of every permission code the platform knows about,
 * seeded on boot from rbac/permissions.catalog.ts. This is what admin UI
 * "assign permissions to a role" screens list — the actual authorization
 * check stays a fast `Role.permissions: string[]` membership test (see
 * Role.ts's design-choice comment); this collection exists only so the
 * catalogue lives in the DB per CLAUDE.md ("permissions in DB, not
 * hard-coded in guards") rather than being invisible to the admin UI.
 */
const permissionSchema = createPlatformSchema({
  code: { type: String, required: true, unique: true, trim: true },
  module: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
});

export interface PermissionDoc {
  _id: Types.ObjectId;
  code: string;
  module: string;
  description?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PermissionModel = model<PermissionDoc>('Permission', permissionSchema);
