import { ClientSession, Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';

export interface RecordAuditInput {
  schoolId?: string | Types.ObjectId | null;
  actorUserId?: string | Types.ObjectId | null;
  action: string;
  entity: string;
  entityId?: string | Types.ObjectId | null;
  before?: unknown;
  after?: unknown;
  ip?: string;
  isSuperAdminBypass?: boolean;
  metadata?: Record<string, unknown>;
  session?: ClientSession;
}

/** Every write endpoint is audit-logged (who/what/when/before/after) — see CLAUDE.md. */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  await AuditLog.create(
    [
      {
        schoolId: input.schoolId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        ip: input.ip,
        isSuperAdminBypass: input.isSuperAdminBypass ?? false,
        metadata: input.metadata ?? {},
      },
    ],
    { session: input.session },
  );
}
