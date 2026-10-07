import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const CONCESSION_KINDS = ['DISCOUNT', 'SCHOLARSHIP', 'SIBLING'] as const;
export const CONCESSION_TYPES = ['PERCENT', 'FIXED'] as const;

/**
 * A standing reduction on one student's fees, applied every time an invoice
 * is generated for them. PERCENT takes `value` as a percentage (0–100);
 * FIXED takes it in minor units. With a `feeHeadId` it applies to that head
 * only; without, to the whole invoice.
 */
const feeConcessionSchema = createTenantSchema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: CONCESSION_KINDS, default: 'DISCOUNT' },
  type: { type: String, enum: CONCESSION_TYPES, required: true },
  value: { type: Number, required: true, min: 0 },
  feeHeadId: { type: Schema.Types.ObjectId, ref: 'FeeHead', default: null },
  isActive: { type: Boolean, default: true },
  notes: { type: String, trim: true },
});

feeConcessionSchema.index({ schoolId: 1, studentId: 1, deletedAt: 1, isActive: 1 });

export interface FeeConcessionDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  studentId: Types.ObjectId;
  name: string;
  kind: (typeof CONCESSION_KINDS)[number];
  type: (typeof CONCESSION_TYPES)[number];
  value: number;
  feeHeadId?: Types.ObjectId | null;
  isActive: boolean;
  notes?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const FeeConcession = model<FeeConcessionDoc>('FeeConcession', feeConcessionSchema);
