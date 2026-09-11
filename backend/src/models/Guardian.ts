import { Schema, InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

/** A parent/guardian contact. Linked to Student via Student.guardians[] (embedded). */
const guardianSchema = createTenantSchema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  occupation: { type: String, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

guardianSchema.index({ schoolId: 1, phone: 1 });

export type GuardianDoc = InferSchemaType<typeof guardianSchema>;
export const Guardian = model('Guardian', guardianSchema);
