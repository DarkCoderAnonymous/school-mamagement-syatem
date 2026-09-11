import { model, Types } from 'mongoose';
import { createPlatformSchema } from './base';

/** Subscription plan catalog (platform-level, managed by SUPER_ADMIN). */
const planSchema = createPlatformSchema({
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, trim: true },
  priceMinor: { type: Number, required: true, min: 0 }, // money as integer, smallest currency unit
  currency: { type: String, default: 'USD' },
  billingCycle: { type: String, enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'], default: 'MONTHLY' },
  limits: {
    students: { type: Number, required: true, min: 0 },
    staff: { type: Number, required: true, min: 0 },
    storageMb: { type: Number, required: true, min: 0, default: 1024 },
    smsCredits: { type: Number, required: true, min: 0, default: 0 },
  },
  enabledModules: { type: [String], default: [] },
  features: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
});

export interface PlanDoc {
  _id: Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  priceMinor: number;
  currency: string;
  billingCycle: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  limits: { students: number; staff: number; storageMb: number; smsCredits: number };
  enabledModules: string[];
  features: string[];
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Plan = model<PlanDoc>('Plan', planSchema);
