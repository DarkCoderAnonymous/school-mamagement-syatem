import { z } from 'zod';
import { LEDGER_TYPES } from '../../models/FinanceCategory';
import { PAYMENT_METHODS } from '../../models/FeePayment';
import { listQueryBase, objectId } from '../../utils/query';

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  type: z.enum(LEDGER_TYPES),
});
export const updateCategorySchema = z.object({ name: z.string().trim().min(1).max(60) });
export const listCategoriesQuerySchema = z.object({ ...listQueryBase, type: z.enum(LEDGER_TYPES).optional() });

export const createEntrySchema = z.object({
  type: z.enum(LEDGER_TYPES),
  categoryId: objectId,
  amountMinor: z.coerce.number().int('Amounts are in minor units (whole numbers)').min(1, 'Amount must be more than zero').max(100_000_000_000),
  date: z.coerce.date().refine((d) => d <= new Date(Date.now() + 86_400_000), 'Date can’t be in the future'),
  description: z.string().trim().min(1, 'Description is required').max(200),
  party: z.string().trim().max(120).optional(),
  method: z.enum(PAYMENT_METHODS).default('CASH'),
  reference: z.string().trim().max(60).optional(),
});
export const voidEntrySchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(200) });
export const listEntriesQuerySchema = z.object({
  ...listQueryBase,
  type: z.enum(LEDGER_TYPES).optional(),
  categoryId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  includeVoided: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});
export const summaryQuerySchema = z.object({ months: z.coerce.number().int().min(1).max(24).default(6) });

export type CreateEntryInput = z.infer<typeof createEntrySchema>;
