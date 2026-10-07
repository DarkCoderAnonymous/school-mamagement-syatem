import { z } from 'zod';
import { FEE_FREQUENCIES } from '../../models/FeeHead';
import { CONCESSION_KINDS, CONCESSION_TYPES } from '../../models/FeeConcession';
import { PAYMENT_METHODS } from '../../models/FeePayment';
import { listQueryBase, objectId } from '../../utils/query';

const money = z.coerce.number().int('Amounts are in minor units (whole numbers)').min(0).max(100_000_000_000);
const positiveMoney = money.refine((n) => n > 0, 'Amount must be more than zero');
const text = (max: number) => z.string().trim().max(max).optional();
const code = z
  .string()
  .trim()
  .min(1, 'Code is required')
  .max(12)
  .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only');

// ─── Heads & structures ──────────────────────────────────────────────────────
export const createFeeHeadSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  code,
  frequency: z.enum(FEE_FREQUENCIES).default('MONTHLY'),
  description: text(300),
});
export const updateFeeHeadSchema = createFeeHeadSchema.partial();

const structureItems = z
  .array(z.object({ feeHeadId: objectId, amountMinor: money }))
  .min(1, 'Add at least one fee')
  .max(40)
  .refine((items) => new Set(items.map((i) => i.feeHeadId)).size === items.length, 'Each fee head can appear once');

export const createFeeStructureSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  classId: objectId,
  /** Defaults to the current session. */
  academicSessionId: objectId.optional(),
  items: structureItems,
});
export const updateFeeStructureSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  items: structureItems.optional(),
});
export const listFeeStructuresQuerySchema = z.object({
  ...listQueryBase,
  academicSessionId: objectId.optional(),
  classId: objectId.optional(),
});

export const updateFeeSettingsSchema = z.object({
  lateFineType: z.enum(['NONE', 'FLAT', 'PER_DAY']).optional(),
  lateFineAmountMinor: money.optional(),
  graceDays: z.coerce.number().int().min(0).max(90).optional(),
  maxFineMinor: money.optional(),
  invoicePrefix: code.optional(),
  receiptPrefix: code.optional(),
});

// ─── Concessions ─────────────────────────────────────────────────────────────
const concessionFields = {
  name: z.string().trim().min(1, 'Name is required').max(80),
  kind: z.enum(CONCESSION_KINDS).default('DISCOUNT'),
  type: z.enum(CONCESSION_TYPES),
  value: z.coerce.number().min(0),
  feeHeadId: objectId.nullable().optional(),
  isActive: z.boolean().default(true),
  notes: text(300),
};
const percentWithinRange = (c: { type?: string; value?: number }) => c.type !== 'PERCENT' || (c.value ?? 0) <= 100;
export const createConcessionSchema = z
  .object({ studentId: objectId, ...concessionFields })
  .refine(percentWithinRange, { message: 'A percentage can be at most 100', path: ['value'] })
  .refine((c) => c.type !== 'FIXED' || Number.isInteger(c.value), {
    message: 'Fixed amounts are in minor units (whole numbers)',
    path: ['value'],
  });
export const updateConcessionSchema = z
  .object({
    name: concessionFields.name.optional(),
    kind: z.enum(CONCESSION_KINDS).optional(),
    type: z.enum(CONCESSION_TYPES).optional(),
    value: z.coerce.number().min(0).optional(),
    feeHeadId: objectId.nullable().optional(),
    isActive: z.boolean().optional(),
    notes: text(300),
  })
  .refine(percentWithinRange, { message: 'A percentage can be at most 100', path: ['value'] });
export const listConcessionsQuerySchema = z.object({ ...listQueryBase, studentId: objectId.optional() });

// ─── Invoices ────────────────────────────────────────────────────────────────
const periodKey = z
  .string()
  .trim()
  .min(1, 'Period is required')
  .max(30)
  .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only (e.g. 2026-09)');

export const generateInvoicesSchema = z
  .object({
    classIds: z.array(objectId).min(1, 'Pick at least one class').max(50),
    /** Subset of heads to bill this run; omit to bill every head in each structure. */
    feeHeadIds: z.array(objectId).max(40).optional(),
    periodKey,
    periodLabel: z.string().trim().min(1, 'Label is required').max(60),
    issueDate: z.coerce.date().optional(),
    dueDate: z.coerce.date(),
  })
  .refine((v) => !v.issueDate || v.dueDate >= v.issueDate, { message: 'Due date is before the issue date', path: ['dueDate'] });

export const createInvoiceSchema = z.object({
  studentId: objectId,
  lines: z
    .array(z.object({ feeHeadId: objectId.optional(), name: z.string().trim().min(1).max(80), amountMinor: positiveMoney }))
    .min(1, 'Add at least one line')
    .max(40),
  periodKey: periodKey.optional(),
  periodLabel: z.string().trim().min(1, 'Label is required').max(60),
  dueDate: z.coerce.date(),
  applyConcessions: z.boolean().default(true),
});

export const listInvoicesQuerySchema = z.object({
  ...listQueryBase,
  status: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'OVERDUE', 'OPEN']).optional(),
  classId: objectId.optional(),
  sectionId: objectId.optional(),
  studentId: objectId.optional(),
  periodKey: z.string().trim().max(30).optional(),
});

export const invoiceAdjustmentSchema = z.object({
  type: z.enum(['DISCOUNT', 'FINE']),
  amountMinor: positiveMoney,
  reason: z.string().trim().min(3, 'Give a reason').max(200),
});
export const cancelInvoiceSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(200) });

// ─── Payments ────────────────────────────────────────────────────────────────
export const recordPaymentSchema = z.object({
  studentId: objectId,
  amountMinor: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  reference: text(80),
  note: text(300),
  // Same rule as ledger entries: a payment can be recorded late, never ahead
  // of time (a day of slack covers timezones). A future or year-0001 date
  // would skew the cash-up and collection reports and the receipt's year.
  paidAt: z.coerce
    .date()
    .refine((d) => d <= new Date(Date.now() + 86_400_000), 'Payment date can’t be in the future')
    .refine((d) => d.getUTCFullYear() >= 2000, 'Enter a real payment date')
    .optional(),
  /** Settle these invoices, in this order. Omit to settle oldest-due first. */
  invoiceIds: z.array(objectId).max(50).optional(),
  /** One per collect attempt — a retry returns the first payment instead of charging twice. */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});
export const refundPaymentSchema = z.object({
  amountMinor: positiveMoney,
  reason: z.string().trim().min(3, 'Give a reason').max(200),
  method: z.enum(PAYMENT_METHODS),
});
export const reversePaymentSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(200) });
export const listPaymentsQuerySchema = z.object({
  ...listQueryBase,
  studentId: objectId.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  status: z.enum(['COMPLETED', 'REVERSED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// ─── Reports ─────────────────────────────────────────────────────────────────
export const defaultersQuerySchema = z.object({ ...listQueryBase, classId: objectId.optional() });
export const remindSchema = z.object({ studentIds: z.array(objectId).max(500).optional() });
export const collectionsQuerySchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });

export type CreateFeeHeadInput = z.infer<typeof createFeeHeadSchema>;
export type UpdateFeeHeadInput = z.infer<typeof updateFeeHeadSchema>;
export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;
export type UpdateFeeStructureInput = z.infer<typeof updateFeeStructureSchema>;
export type UpdateFeeSettingsInput = z.infer<typeof updateFeeSettingsSchema>;
export type CreateConcessionInput = z.infer<typeof createConcessionSchema>;
export type UpdateConcessionInput = z.infer<typeof updateConcessionSchema>;
export type GenerateInvoicesInput = z.infer<typeof generateInvoicesSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type InvoiceAdjustmentInput = z.infer<typeof invoiceAdjustmentSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
