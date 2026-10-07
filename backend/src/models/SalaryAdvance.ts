import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * Money advanced to a staff member, recovered from their pay in fixed
 * instalments. `recoveredMinor` moves only when a payroll run is LOCKED —
 * never on a draft, which can still be recalculated or discarded.
 */
const salaryAdvanceSchema = createTenantSchema({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  installmentMinor: { type: Number, required: true, min: 1 },
  recoveredMinor: { type: Number, default: 0, min: 0 },
  reason: { type: String, trim: true },
  issuedAt: { type: Date, required: true },
  status: { type: String, enum: ['ACTIVE', 'CLOSED', 'CANCELLED'], default: 'ACTIVE' },
});

salaryAdvanceSchema.index({ schoolId: 1, deletedAt: 1, employeeId: 1, status: 1 });

export interface SalaryAdvanceDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  employeeId: Types.ObjectId;
  amountMinor: number;
  installmentMinor: number;
  recoveredMinor: number;
  reason?: string;
  issuedAt: Date;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const SalaryAdvance = model<SalaryAdvanceDoc>('SalaryAdvance', salaryAdvanceSchema);
