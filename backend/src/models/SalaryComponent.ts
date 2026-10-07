import { model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const COMPONENT_TYPES = ['EARNING', 'DEDUCTION'] as const;
export const COMPONENT_CALCULATIONS = ['FIXED', 'PERCENT_OF_BASIC', 'PERCENT_OF_GROSS'] as const;
export type ComponentCalculation = (typeof COMPONENT_CALCULATIONS)[number];

/**
 * A line that can appear on a payslip: House rent (earning, 40% of basic),
 * Provident fund (deduction, 5% of basic), Income tax (deduction, % of gross).
 * `defaultValue` is minor units for FIXED, a percentage otherwise; each
 * employee's salary structure may override it. Earnings can't be a percentage
 * of gross — gross is the sum of the earnings, so that would be circular.
 */
const salaryComponentSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  type: { type: String, enum: COMPONENT_TYPES, required: true },
  calculation: { type: String, enum: COMPONENT_CALCULATIONS, required: true },
  defaultValue: { type: Number, required: true, min: 0 },
  isActive: { type: Boolean, default: true },
});

salaryComponentSchema.index({ schoolId: 1, code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
salaryComponentSchema.index({ schoolId: 1, deletedAt: 1, type: 1, name: 1 });

export interface SalaryComponentDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  code: string;
  type: (typeof COMPONENT_TYPES)[number];
  calculation: ComponentCalculation;
  defaultValue: number;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const SalaryComponent = model<SalaryComponentDoc>('SalaryComponent', salaryComponentSchema);
