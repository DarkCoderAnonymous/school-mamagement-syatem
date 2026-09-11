import { Schema, model, Types } from 'mongoose';
import { createPlatformSchema } from './base';

/**
 * School = the tenant itself. Platform-level entity managed by SUPER_ADMIN,
 * so it does NOT carry a schoolId or the tenant plugin.
 */
const schoolSchema = createPlatformSchema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  logoUrl: { type: String, trim: true, default: null },
  primaryColor: { type: String, trim: true, default: '#2563eb' },
  contactEmail: { type: String, required: true, lowercase: true, trim: true },
  contactPhone: { type: String, trim: true },
  address: { type: String, trim: true },
  timezone: { type: String, default: 'UTC' },
  currency: { type: String, default: 'USD' },
  locale: { type: String, default: 'en' },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'EXPIRED'], default: 'ACTIVE' },
  registrationId: { type: Schema.Types.ObjectId, ref: 'SchoolRegistration', default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

export type SchoolStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';

export interface SchoolDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  timezone?: string;
  currency?: string;
  locale?: string;
  status: SchoolStatus;
  registrationId?: Types.ObjectId | null;
  createdBy?: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const School = model<SchoolDoc>('School', schoolSchema);
