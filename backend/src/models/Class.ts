import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/** e.g. "Grade 5", "Class X". Belongs to one academic session. */
const classSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  campusId: { type: Schema.Types.ObjectId, ref: 'Campus' },
  academicSessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  /** Display order — "Grade 2" before "Grade 10", which a name sort gets wrong. */
  order: { type: Number, default: 0 },
});

// Partial-filtered so a soft-deleted row stops occupying the key: deletes are
// soft, so without this the value could never be reused (CLAUDE.md).
classSchema.index(
  { schoolId: 1, academicSessionId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// The class list: one session, in display order.
classSchema.index({ schoolId: 1, deletedAt: 1, academicSessionId: 1, order: 1 });

export interface ClassDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  campusId?: Types.ObjectId | null;
  academicSessionId: Types.ObjectId;
  order: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Class = model<ClassDoc>('Class', classSchema);
