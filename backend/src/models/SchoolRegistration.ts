import { Schema, model, Types } from 'mongoose';
import { DEFAULT_SCHOOL_CURRENCY, SCHOOL_CURRENCY_CODES } from '@sms/shared';
import { createPlatformSchema } from './base';

/**
 * A public application from a prospective school. Platform-level (not
 * tenant-scoped — there is no school yet). On approval, a School +
 * Subscription + default Roles + School Admin User are provisioned
 * atomically (see modules/admin/registrations) and `schoolId` is set here.
 */
const schoolRegistrationSchema = createPlatformSchema({
  schoolName: { type: String, required: true, trim: true },
  contactPerson: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  address: { type: String, trim: true },
  city: { type: String, trim: true },
  country: { type: String, trim: true },
  curriculum: { type: String, trim: true },
  /** The currency the school will run in (ISO 4217) — copied onto the School at approval. */
  currency: { type: String, enum: SCHOOL_CURRENCY_CODES, default: DEFAULT_SCHOOL_CURRENCY },
  expectedStudents: { type: Number, min: 0 },
  requestedPlanId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
  documents: {
    type: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        uploadedAt: { type: Date, default: () => new Date() },
      },
    ],
    default: [],
  },
  status: {
    type: String,
    enum: ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
  },
  reviewNotes: { type: String, trim: true, default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', default: null },
});

// A given email may only have one non-rejected application outstanding at a
// time; once rejected, they're free to re-apply with the same email.
schoolRegistrationSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: 'REJECTED' } } },
);
schoolRegistrationSchema.index({ status: 1, createdAt: -1 });

export type RegistrationStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface SchoolRegistrationDoc {
  _id: Types.ObjectId;
  schoolName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  country?: string;
  curriculum?: string;
  currency?: string;
  expectedStudents?: number;
  requestedPlanId: Types.ObjectId;
  documents: { name: string; url: string; uploadedAt: Date }[];
  status: RegistrationStatus;
  reviewNotes?: string | null;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  schoolId?: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const SchoolRegistration = model<SchoolRegistrationDoc>('SchoolRegistration', schoolRegistrationSchema);
