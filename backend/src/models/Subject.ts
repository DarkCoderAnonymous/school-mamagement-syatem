import { InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

const subjectSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  isElective: { type: Boolean, default: false },
});

subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });

export type SubjectDoc = InferSchemaType<typeof subjectSchema>;
export const Subject = model('Subject', subjectSchema);
