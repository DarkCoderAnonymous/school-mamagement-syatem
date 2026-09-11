import { InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

const subjectSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  isElective: { type: Boolean, default: false },
});

// Partial-filtered so a soft-deleted row stops occupying the key: deletes are
// soft, so without this the value could never be reused (CLAUDE.md).
subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

export type SubjectDoc = InferSchemaType<typeof subjectSchema>;
export const Subject = model('Subject', subjectSchema);
