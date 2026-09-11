import { InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

/** A school may operate multiple physical campuses/branches. */
const campusSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  address: { type: String, trim: true },
  isMain: { type: Boolean, default: false },
});

campusSchema.index({ schoolId: 1, name: 1 }, { unique: true });

export type CampusDoc = InferSchemaType<typeof campusSchema>;
export const Campus = model('Campus', campusSchema);
