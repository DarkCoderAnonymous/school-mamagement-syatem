import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * One employee's pay: basic plus the components that apply to them, and the
 * bank details the transfer file needs. One live structure per employee;
 * changes are audited (before/after), and a payroll run snapshots the
 * computed figures onto each payslip, so editing a structure never alters a
 * locked month.
 */
const structureComponentSchema = new Schema(
  {
    componentId: { type: Schema.Types.ObjectId, ref: 'SalaryComponent', required: true },
    /** Overrides the component's default: minor units for FIXED, % otherwise. */
    value: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const salaryStructureSchema = createTenantSchema({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  basicMinor: { type: Number, required: true, min: 0 },
  components: { type: [structureComponentSchema], default: [] },
  bankName: { type: String, trim: true },
  accountTitle: { type: String, trim: true },
  accountNumber: { type: String, trim: true },
  effectiveFrom: { type: Date, required: true },
});

salaryStructureSchema.index(
  { schoolId: 1, employeeId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export interface SalaryStructureDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  employeeId: Types.ObjectId;
  basicMinor: number;
  components: { componentId: Types.ObjectId; value: number }[];
  bankName?: string;
  accountTitle?: string;
  accountNumber?: string;
  effectiveFrom: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const SalaryStructure = model<SalaryStructureDoc>('SalaryStructure', salaryStructureSchema);
