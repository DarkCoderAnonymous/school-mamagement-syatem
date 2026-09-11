import { Schema, model, Types } from 'mongoose';
import { createPlatformSchema } from './base';

/**
 * A School's subscription to a Plan. Platform-level (managed by
 * SUPER_ADMIN), references School/Plan by id but is not itself tenant-scoped
 * by the tenant plugin.
 */
const subscriptionSchema = createPlatformSchema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
  status: {
    type: String,
    enum: ['TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED'],
    default: 'TRIAL',
  },
  autoRenew: { type: Boolean, default: true },
  startsAt: { type: Date, required: true, default: () => new Date() },
  endsAt: { type: Date },
  cancelledAt: { type: Date },
  usage: {
    studentsCount: { type: Number, default: 0 },
    staffCount: { type: Number, default: 0 },
    storageUsedMb: { type: Number, default: 0 },
    smsUsedCredits: { type: Number, default: 0 },
  },
});

subscriptionSchema.index({ schoolId: 1, status: 1 });

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'CANCELLED';

export interface SubscriptionDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  planId: Types.ObjectId;
  status: SubscriptionStatus;
  autoRenew: boolean;
  startsAt: Date;
  endsAt?: Date | null;
  cancelledAt?: Date | null;
  usage: { studentsCount: number; staffCount: number; storageUsedMb: number; smsUsedCredits: number };
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Subscription = model<SubscriptionDoc>('Subscription', subscriptionSchema);
