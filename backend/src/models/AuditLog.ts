import { Schema, model, Types } from 'mongoose';
import { createPlatformSchema } from './base';

/**
 * AuditLog is intentionally NOT run through the tenant-scoping plugin: it
 * must be writable for cross-tenant SUPER_ADMIN bypass events (which by
 * definition don't belong to a single school's scoped view), and readable
 * across schools by SUPER_ADMIN. Per-school reads (`audit.log.read`) filter
 * by schoolId explicitly in the service layer instead.
 */
const auditLogSchema = createPlatformSchema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  action: { type: String, required: true }, // e.g. "student.create", "auth.login"
  entity: { type: String, required: true }, // e.g. "Student"
  entityId: { type: Schema.Types.ObjectId, default: null },
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null },
  ip: { type: String },
  isSuperAdminBypass: { type: Boolean, default: false },
  metadata: { type: Schema.Types.Mixed, default: {} },
});

auditLogSchema.index({ schoolId: 1, createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 });

export interface AuditLogDoc {
  _id: Types.ObjectId;
  schoolId?: Types.ObjectId | null;
  actorUserId?: Types.ObjectId | null;
  action: string;
  entity: string;
  entityId?: Types.ObjectId | null;
  before?: unknown;
  after?: unknown;
  ip?: string;
  isSuperAdminBypass: boolean;
  metadata: Record<string, unknown>;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const AuditLog = model<AuditLogDoc>('AuditLog', auditLogSchema);
