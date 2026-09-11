import { InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

/** An academic year/session, e.g. "2025-2026". */
const academicSessionSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isCurrent: { type: Boolean, default: false },
});

academicSessionSchema.index({ schoolId: 1, name: 1 }, { unique: true });

export type AcademicSessionDoc = InferSchemaType<typeof academicSessionSchema>;
export const AcademicSession = model('AcademicSession', academicSessionSchema);
