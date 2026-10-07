import { model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const FEE_FREQUENCIES = ['MONTHLY', 'TERM', 'ANNUAL', 'ONE_TIME'] as const;
export type FeeFrequency = (typeof FEE_FREQUENCIES)[number];

/**
 * A kind of charge: Tuition, Admission, Exam, Lab, Library. `frequency` is a
 * hint for the invoice wizard (monthly heads are pre-ticked for a monthly
 * run); what actually goes on an invoice is chosen per run.
 */
const feeHeadSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  frequency: { type: String, enum: FEE_FREQUENCIES, default: 'MONTHLY' },
  description: { type: String, trim: true },
});

feeHeadSchema.index({ schoolId: 1, code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
feeHeadSchema.index({ schoolId: 1, deletedAt: 1, name: 1 });

export interface FeeHeadDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  code: string;
  frequency: FeeFrequency;
  description?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const FeeHead = model<FeeHeadDoc>('FeeHead', feeHeadSchema);
