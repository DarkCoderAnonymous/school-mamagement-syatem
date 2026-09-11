import { Schema, InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

/** e.g. "Grade 5", "Class X". */
const classSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  campusId: { type: Schema.Types.ObjectId, ref: 'Campus' },
  academicSessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  order: { type: Number, default: 0 },
});

// Partial-filtered so a soft-deleted row stops occupying the key: deletes are
// soft, so without this the value could never be reused (CLAUDE.md).
classSchema.index(
  { schoolId: 1, academicSessionId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export type ClassDoc = InferSchemaType<typeof classSchema>;
export const Class = model('Class', classSchema);
