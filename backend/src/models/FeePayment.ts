import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Money received from a family, with one receipt number. A single payment can
 * settle several invoices (`allocations`, oldest first) — a parent paying two
 * months at the counter gets one receipt.
 *
 * Nothing here is ever edited or deleted:
 *  - a REFUND records money handed back (partial allowed) in `refunds[]`;
 *  - a REVERSAL voids a payment recorded in error (bounced cheque, wrong
 *    student) — status REVERSED, the full amount comes off its invoices.
 * Both happen in a transaction with the invoice updates, and both are audited.
 *
 * `idempotencyKey` is the collect screen's per-attempt key: a double-click or
 * a retried request returns the first payment instead of charging twice.
 */
const allocationSchema = new Schema(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'FeeInvoice', required: true },
    amountMinor: { type: Number, required: true, min: 1 },
    /** How much of this allocation has since been refunded or reversed off its invoice. */
    refundedMinor: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const refundSchema = new Schema(
  {
    amountMinor: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true, trim: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    at: { type: Date, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const feePaymentSchema = createTenantSchema({
  receiptNumber: { type: String, required: true, trim: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  allocations: { type: [allocationSchema], default: [] },
  amountMinor: { type: Number, required: true, min: 1 },
  method: { type: String, enum: PAYMENT_METHODS, required: true },
  reference: { type: String, trim: true },
  note: { type: String, trim: true },
  paidAt: { type: Date, required: true },
  receivedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  idempotencyKey: { type: String, trim: true },
  status: { type: String, enum: ['COMPLETED', 'REVERSED'], default: 'COMPLETED' },
  refundedMinor: { type: Number, default: 0, min: 0 },
  refunds: { type: [refundSchema], default: [] },
  reversedAt: { type: Date, default: null },
  reversedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reversalReason: { type: String, trim: true },
});

feePaymentSchema.index(
  { schoolId: 1, receiptNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
feePaymentSchema.index(
  { schoolId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, idempotencyKey: { $type: 'string' } } },
);
// Collection reports by date, and a student's payment history.
feePaymentSchema.index({ schoolId: 1, deletedAt: 1, status: 1, paidAt: -1 });
feePaymentSchema.index({ schoolId: 1, studentId: 1, paidAt: -1 });
feePaymentSchema.index({ schoolId: 1, 'allocations.invoiceId': 1 });

export interface FeePaymentDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  receiptNumber: string;
  studentId: Types.ObjectId;
  allocations: { invoiceId: Types.ObjectId; amountMinor: number; refundedMinor: number }[];
  amountMinor: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  paidAt: Date;
  receivedByUserId: Types.ObjectId;
  idempotencyKey?: string;
  status: 'COMPLETED' | 'REVERSED';
  refundedMinor: number;
  refunds: { amountMinor: number; reason: string; method: PaymentMethod; at: Date; byUserId: Types.ObjectId }[];
  reversedAt: Date | null;
  reversedByUserId?: Types.ObjectId | null;
  reversalReason?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const FeePayment = model<FeePaymentDoc>('FeePayment', feePaymentSchema);
