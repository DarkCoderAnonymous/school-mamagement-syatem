import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const INVOICE_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * One bill for one student for one period ("September 2026", "Annual charges
 * 2026-27"). Lines are SNAPSHOTS — name and amount copied from the structure
 * at generation time — so later edits to a fee structure never rewrite a bill
 * a parent has already received.
 *
 *   totalMinor = subtotalMinor − concessionMinor − discountMinor + fineMinor + lateFineMinor
 *   balance    = totalMinor − paidMinor
 *
 * `paidMinor` and `status` are maintained ONLY by fees.service's payment,
 * refund and reversal functions, inside the transaction that moves the money.
 * "Overdue" is not a stored status: it's `dueDate` passed with a balance left,
 * computed at read time so it can never go stale.
 */
const invoiceLineSchema = new Schema(
  {
    feeHeadId: { type: Schema.Types.ObjectId, ref: 'FeeHead', default: null },
    name: { type: String, required: true, trim: true },
    amountMinor: { type: Number, required: true, min: 0 },
    concessionMinor: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const adjustmentSchema = new Schema(
  {
    type: { type: String, enum: ['DISCOUNT', 'FINE'], required: true },
    amountMinor: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true },
    at: { type: Date, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

const feeInvoiceSchema = createTenantSchema({
  invoiceNumber: { type: String, required: true, trim: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', default: null },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', default: null },
  academicSessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', default: null },
  /** Machine key for the billing period ("2026-09"); a student gets one live invoice per key. */
  periodKey: { type: String, required: true, trim: true },
  periodLabel: { type: String, required: true, trim: true },
  issueDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  lines: { type: [invoiceLineSchema], default: [] },
  /** Standing concessions applied at generation, for the breakdown on the bill. */
  concessions: { type: [{ name: String, amountMinor: Number, _id: false }], default: [] },
  subtotalMinor: { type: Number, required: true, min: 0 },
  concessionMinor: { type: Number, default: 0, min: 0 },
  discountMinor: { type: Number, default: 0, min: 0 },
  /** Manual fines added by staff. */
  fineMinor: { type: Number, default: 0, min: 0 },
  /**
   * The rule-based late fine, recomputed (only ever upward) each time late
   * fines are applied — kept apart from manual fines so re-running the rule
   * can't stack one fine on another.
   */
  lateFineMinor: { type: Number, default: 0, min: 0 },
  totalMinor: { type: Number, required: true, min: 0 },
  paidMinor: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: INVOICE_STATUSES, default: 'UNPAID' },
  adjustments: { type: [adjustmentSchema], default: [] },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, trim: true },
  lastReminderAt: { type: Date, default: null },
});

feeInvoiceSchema.index(
  { schoolId: 1, invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// One live invoice per student per period: re-running a month's generation can't double-bill.
feeInvoiceSchema.index(
  { schoolId: 1, studentId: 1, periodKey: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, cancelledAt: null } },
);
// The invoice list and the overdue/defaulter queries.
feeInvoiceSchema.index({ schoolId: 1, deletedAt: 1, status: 1, dueDate: 1 });
feeInvoiceSchema.index({ schoolId: 1, deletedAt: 1, classId: 1, periodKey: 1 });
feeInvoiceSchema.index({ schoolId: 1, studentId: 1, issueDate: -1 });

export interface InvoiceLine {
  feeHeadId?: Types.ObjectId | null;
  name: string;
  amountMinor: number;
  concessionMinor: number;
}

export interface FeeInvoiceDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  invoiceNumber: string;
  studentId: Types.ObjectId;
  classId?: Types.ObjectId | null;
  sectionId?: Types.ObjectId | null;
  academicSessionId?: Types.ObjectId | null;
  periodKey: string;
  periodLabel: string;
  issueDate: Date;
  dueDate: Date;
  lines: InvoiceLine[];
  concessions: { name: string; amountMinor: number }[];
  subtotalMinor: number;
  concessionMinor: number;
  discountMinor: number;
  fineMinor: number;
  lateFineMinor: number;
  totalMinor: number;
  paidMinor: number;
  status: InvoiceStatus;
  adjustments: { type: 'DISCOUNT' | 'FINE'; amountMinor: number; reason: string; at: Date; byUserId?: Types.ObjectId | null }[];
  cancelledAt: Date | null;
  cancelReason?: string;
  lastReminderAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const FeeInvoice = model<FeeInvoiceDoc>('FeeInvoice', feeInvoiceSchema);
