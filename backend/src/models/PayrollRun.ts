import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const PAYROLL_STATUSES = ['DRAFT', 'LOCKED', 'PUBLISHED'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

/**
 * One month's payroll. DRAFT → review and adjust payslips, recalculate freely.
 * LOCKED → figures frozen, advance recoveries booked. PUBLISHED → staff can see
 * their payslips and the salary expense is posted to the finance ledger.
 * There is no way back from LOCKED: a mistake is corrected in next month's run.
 */
const payrollRunSchema = createTenantSchema({
  /** "YYYY-MM". One live run per month per school. */
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  status: { type: String, enum: PAYROLL_STATUSES, default: 'DRAFT' },
  employeeCount: { type: Number, default: 0 },
  grossMinor: { type: Number, default: 0 },
  deductionsMinor: { type: Number, default: 0 },
  netMinor: { type: Number, default: 0 },
  notes: { type: String, trim: true },
  createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  lockedAt: { type: Date, default: null },
  lockedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, default: null },
  publishedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

payrollRunSchema.index({ schoolId: 1, month: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
payrollRunSchema.index({ schoolId: 1, deletedAt: 1, month: -1 });

export interface PayrollRunDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  month: string;
  status: PayrollStatus;
  employeeCount: number;
  grossMinor: number;
  deductionsMinor: number;
  netMinor: number;
  notes?: string;
  createdByUserId?: Types.ObjectId | null;
  lockedAt: Date | null;
  lockedByUserId?: Types.ObjectId | null;
  publishedAt: Date | null;
  publishedByUserId?: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PayrollRun = model<PayrollRunDoc>('PayrollRun', payrollRunSchema);
