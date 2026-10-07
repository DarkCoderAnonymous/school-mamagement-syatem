import { model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const LEDGER_TYPES = ['EXPENSE', 'INCOME'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

/**
 * Where money goes (Utilities, Maintenance, Salaries) or comes from besides
 * fees (Donations, Hall rental). `isSystem` categories are created by the app
 * — "Salaries" receives payroll postings — and can't be renamed or archived.
 */
const financeCategorySchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: LEDGER_TYPES, required: true },
  isSystem: { type: Boolean, default: false },
});

financeCategorySchema.index(
  { schoolId: 1, type: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export interface FinanceCategoryDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  type: LedgerType;
  isSystem: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const FinanceCategory = model<FinanceCategoryDoc>('FinanceCategory', financeCategorySchema);
