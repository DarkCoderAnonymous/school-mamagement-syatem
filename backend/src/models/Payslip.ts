import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';
import { PAYROLL_STATUSES, type PayrollStatus } from './PayrollRun';

/**
 * One employee's pay for one run. Everything a printed payslip shows is
 * SNAPSHOTTED here — name, designation, bank details, each line — so a
 * payslip reads the same years later whatever has changed since.
 *
 *   gross      = basic + Σ earnings
 *   deductions = Σ deductions + unpaid leave + advance recoveries
 *   net        = gross − deductions + Σ adjustments (signed: bonus +, penalty −)
 */
const lineSchema = new Schema(
  {
    code: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    amountMinor: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const payslipSchema = createTenantSchema({
  payrollRunId: { type: Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  /** The person — how a staff member finds their own payslips. */
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true },
  status: { type: String, enum: PAYROLL_STATUSES, default: 'DRAFT' },
  employee: {
    name: { type: String, required: true },
    employeeNumber: { type: String, required: true },
    designation: { type: String },
    department: { type: String },
  },
  bank: {
    bankName: { type: String },
    accountTitle: { type: String },
    accountNumber: { type: String },
  },
  daysInMonth: { type: Number, required: true },
  basicMinor: { type: Number, required: true, min: 0 },
  earnings: { type: [lineSchema], default: [] },
  deductions: { type: [lineSchema], default: [] },
  unpaidLeaveDays: { type: Number, default: 0, min: 0 },
  unpaidLeaveDeductionMinor: { type: Number, default: 0, min: 0 },
  /** What the staff register said when the draft was (re)built: Absent/Unpaid leave 1, Half day ½. */
  attendanceUnpaidDays: { type: Number, default: 0, min: 0 },
  /** True once someone set the unpaid days by hand; recalculating then keeps their number. */
  unpaidLeaveOverridden: { type: Boolean, default: false },
  advanceRecoveries: {
    type: [{ advanceId: { type: Schema.Types.ObjectId, ref: 'SalaryAdvance' }, amountMinor: Number, _id: false }],
    default: [],
  },
  adjustments: { type: [{ label: String, amountMinor: Number, _id: false }], default: [] },
  grossMinor: { type: Number, required: true, min: 0 },
  totalDeductionsMinor: { type: Number, required: true, min: 0 },
  netMinor: { type: Number, required: true },
});

payslipSchema.index(
  { schoolId: 1, payrollRunId: 1, employeeId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// "My payslips", newest first.
payslipSchema.index({ schoolId: 1, userId: 1, status: 1, month: -1 });
// One employee's payslips by year, newest first — their staff profile.
payslipSchema.index({ schoolId: 1, deletedAt: 1, employeeId: 1, month: -1 });

export interface PayslipLine {
  code?: string;
  name: string;
  amountMinor: number;
}

export interface PayslipDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  payrollRunId: Types.ObjectId;
  employeeId: Types.ObjectId;
  userId: Types.ObjectId;
  month: string;
  status: PayrollStatus;
  employee: { name: string; employeeNumber: string; designation?: string; department?: string };
  bank: { bankName?: string; accountTitle?: string; accountNumber?: string };
  daysInMonth: number;
  basicMinor: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  unpaidLeaveDays: number;
  unpaidLeaveDeductionMinor: number;
  attendanceUnpaidDays?: number;
  unpaidLeaveOverridden?: boolean;
  advanceRecoveries: { advanceId: Types.ObjectId; amountMinor: number }[];
  adjustments: { label: string; amountMinor: number }[];
  grossMinor: number;
  totalDeductionsMinor: number;
  netMinor: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Payslip = model<PayslipDoc>('Payslip', payslipSchema);
