import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';
import { LEDGER_TYPES, type LedgerType } from './FinanceCategory';
import { PAYMENT_METHODS, type PaymentMethod } from './FeePayment';

/**
 * A school expense or a non-fee income. Fee collections are NOT copied here —
 * they live in FeePayment and the finance summary reads both, so nothing is
 * counted twice. Payroll posts one expense per published run (`source`).
 *
 * Entries are never edited after the fact; a wrong one is VOIDED (kept, with
 * who/why) and re-entered, so the books keep their history.
 *
 * Money is integer minor units (CLAUDE.md).
 */
const ledgerEntrySchema = createTenantSchema({
  type: { type: String, enum: LEDGER_TYPES, required: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'FinanceCategory', required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  date: { type: Date, required: true },
  description: { type: String, required: true, trim: true },
  /** Paid to (expense) or received from (income). */
  party: { type: String, trim: true },
  method: { type: String, enum: PAYMENT_METHODS, default: 'CASH' },
  reference: { type: String, trim: true },
  recordedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  source: { type: String, enum: ['MANUAL', 'PAYROLL'], default: 'MANUAL' },
  sourceId: { type: Schema.Types.ObjectId, default: null },
  voidedAt: { type: Date, default: null },
  voidedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  voidReason: { type: String, trim: true },
});

// The ledger list and the summary: type + date range, excluding voided rows.
ledgerEntrySchema.index({ schoolId: 1, deletedAt: 1, type: 1, voidedAt: 1, date: -1 });
ledgerEntrySchema.index({ schoolId: 1, categoryId: 1, date: -1 });

export interface LedgerEntryDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  type: LedgerType;
  categoryId: Types.ObjectId;
  amountMinor: number;
  date: Date;
  description: string;
  party?: string;
  method: PaymentMethod;
  reference?: string;
  recordedByUserId: Types.ObjectId;
  source: 'MANUAL' | 'PAYROLL';
  sourceId?: Types.ObjectId | null;
  voidedAt: Date | null;
  voidedByUserId?: Types.ObjectId | null;
  voidReason?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const LedgerEntry = model<LedgerEntryDoc>('LedgerEntry', ledgerEntrySchema);
