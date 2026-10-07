import { Schema, model, Types } from 'mongoose';
import { DEFAULT_SCHOOL_THEME, SCHOOL_THEME_KEYS } from '@sms/shared';
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
  /**
   * The accent palette the school admin picked (SCHOOL_THEMES key). The app
   * shell applies it for everyone in the school; `primaryColor` follows its
   * swatch so the school's avatar badge matches.
   */
  theme: { type: String, enum: SCHOOL_THEME_KEYS, default: DEFAULT_SCHOOL_THEME },
  contactEmail: { type: String, required: true, lowercase: true, trim: true },
  contactPhone: { type: String, trim: true },
  address: { type: String, trim: true },
  timezone: { type: String, default: 'UTC' },
  currency: { type: String, default: 'USD' },
  locale: { type: String, default: 'en' },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'EXPIRED'], default: 'ACTIVE' },
  /**
   * The school's fee rules. Kept on the School (one per tenant, edited via
   * fees.service) rather than a singleton tenant collection: it's school
   * configuration, like currency and timezone, which late fines depend on.
   */
  feeSettings: {
    lateFineType: { type: String, enum: ['NONE', 'FLAT', 'PER_DAY'], default: 'NONE' },
    lateFineAmountMinor: { type: Number, default: 0, min: 0 },
    /** Days after the due date before any fine applies. */
    graceDays: { type: Number, default: 0, min: 0 },
    /** Cap for PER_DAY fines. 0 = no cap. */
    maxFineMinor: { type: Number, default: 0, min: 0 },
    invoicePrefix: { type: String, default: 'INV', trim: true },
    receiptPrefix: { type: String, default: 'RCPT', trim: true },
  },
  /**
   * How results are graded. One scale per school, kept on the School like
   * fee settings (it's school configuration). Bands are matched on overall
   * and per-subject percentage, highest `minPercent` first. Published results
   * snapshot the grade, so editing the scale never rewrites a report card.
   */
  examSettings: {
    gradingBands: {
      type: [{ grade: String, minPercent: Number, remark: String, _id: false }],
      default: undefined,
    },
    /** Show class/section positions on results and report cards. */
    showPositions: { type: Boolean, default: true },
  },
  /**
   * The school week and how late a teacher may take a missed register.
   * Holidays are their own collection (models/Holiday).
   */
  attendanceSettings: {
    /** 0 = Sunday … 6 = Saturday. Unset means the default: Sunday. */
    weeklyOffDays: { type: [Number], default: undefined },
    /** School days before today a teacher may still take (back from leave). 0 = today only. */
    teacherBackdateDays: { type: Number, min: 0, max: 7 },
  },
  registrationId: { type: Schema.Types.ObjectId, ref: 'SchoolRegistration', default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

export type SchoolStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';

export interface GradingBand {
  grade: string;
  minPercent: number;
  remark?: string;
}

export interface FeeSettings {
  lateFineType: 'NONE' | 'FLAT' | 'PER_DAY';
  lateFineAmountMinor: number;
  graceDays: number;
  maxFineMinor: number;
  invoicePrefix: string;
  receiptPrefix: string;
}

export interface SchoolDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string;
  theme?: string;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  timezone?: string;
  currency?: string;
  locale?: string;
  status: SchoolStatus;
  feeSettings?: FeeSettings;
  examSettings?: { gradingBands?: GradingBand[]; showPositions?: boolean };
  attendanceSettings?: { weeklyOffDays?: number[]; teacherBackdateDays?: number };
  registrationId?: Types.ObjectId | null;
  createdBy?: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const School = model<SchoolDoc>('School', schoolSchema);
