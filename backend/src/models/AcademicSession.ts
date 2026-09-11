import { model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/** An academic year/session, e.g. "2025-2026". */
const academicSessionSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isCurrent: { type: Boolean, default: false },
});

// Partial-filtered so a soft-deleted row stops occupying the key: deletes are
// soft, so without this the value could never be reused (CLAUDE.md).
academicSessionSchema.index(
  { schoolId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// Every list query filters on schoolId + deletedAt and sorts by start date,
// and "which session is current" is read on nearly every screen — both get a
// compound index led by schoolId, per CLAUDE.md.
academicSessionSchema.index({ schoolId: 1, deletedAt: 1, startDate: -1 });
academicSessionSchema.index({ schoolId: 1, isCurrent: 1, deletedAt: 1 });

/**
 * Declared explicitly rather than via InferSchemaType so `_id` is typed as an
 * ObjectId — the inferred type omits it, which silently degrades every
 * `session._id` to `unknown` at the call site. Matches User/School.
 */
export interface AcademicSessionDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const AcademicSession = model<AcademicSessionDoc>('AcademicSession', academicSessionSchema);
