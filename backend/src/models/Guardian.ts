import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/** A parent/guardian contact. Linked to Student via Student.guardians[] (embedded). */
const guardianSchema = createTenantSchema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  occupation: { type: String, trim: true },
  address: { type: String, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

// Phone is how front offices find a family ("which parent is calling?").
guardianSchema.index({ schoolId: 1, phone: 1 });
guardianSchema.index({ schoolId: 1, deletedAt: 1, lastName: 1, firstName: 1 });

export interface GuardianDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  occupation?: string;
  address?: string;
  userId?: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Guardian = model<GuardianDoc>('Guardian', guardianSchema);
