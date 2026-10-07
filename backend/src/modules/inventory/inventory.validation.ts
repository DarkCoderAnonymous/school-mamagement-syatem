import { z } from 'zod';
import { INVENTORY_UNITS } from '../../models/InventoryItem';
import { MOVEMENT_TYPES } from '../../models/InventoryMovement';
import { listQueryBase, objectId } from '../../utils/query';

const text = (max: number) => z.string().trim().max(max).optional();
const quantity = z.coerce.number().int('Whole numbers only').max(1_000_000);
const moneyMinor = z.coerce.number().int().min(0).max(1_000_000_000);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  description: text(200),
});
export const updateCategorySchema = createCategorySchema.partial();
export const listCategoriesQuerySchema = z.object({ ...listQueryBase });

export const createItemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  categoryId: objectId,
  /** Optional — issued from the per-school sequence (ITM-0001) when omitted. */
  sku: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z0-9-]*$/, 'Letters, numbers and dashes only')
    .optional(),
  unit: z.enum(INVENTORY_UNITS).default('PIECE'),
  reorderLevel: quantity.min(0).default(0),
  unitCostMinor: moneyMinor.default(0),
  location: text(80),
  description: text(500),
  /** Stock already on the shelf; recorded as an opening RECEIVE movement. */
  openingQuantity: quantity.min(0).default(0),
});

/** quantityOnHand is deliberately absent: it changes only through movements. */
export const updateItemSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  categoryId: objectId.optional(),
  unit: z.enum(INVENTORY_UNITS).optional(),
  reorderLevel: quantity.min(0).optional(),
  unitCostMinor: moneyMinor.optional(),
  location: text(80),
  description: text(500),
});

export const listItemsQuerySchema = z.object({
  ...listQueryBase,
  categoryId: objectId.optional(),
  stock: z.enum(['low', 'out', 'in']).optional(),
});

export const recordMovementSchema = z
  .object({
    type: z.enum(MOVEMENT_TYPES),
    /** Positive for every type except ADJUST, where the sign is the correction's direction. */
    quantity: quantity.refine((n) => n !== 0, 'Quantity cannot be zero'),
    unitCostMinor: moneyMinor.optional(),
    party: text(120),
    reference: text(60),
    note: text(300),
    occurredAt: z.coerce.date().optional(),
  })
  .refine((m) => m.type === 'ADJUST' || m.quantity > 0, {
    message: 'Quantity must be positive',
    path: ['quantity'],
  })
  .refine((m) => !['ISSUE', 'RETURN'].includes(m.type) || !!m.party, {
    message: 'Say who it was issued to or returned by',
    path: ['party'],
  })
  .refine((m) => m.type !== 'ADJUST' || !!m.note, {
    message: 'Explain the adjustment (e.g. "annual stock count")',
    path: ['note'],
  })
  .refine((m) => !m.occurredAt || m.occurredAt <= new Date(Date.now() + 60_000), {
    message: 'Date cannot be in the future',
    path: ['occurredAt'],
  });

export const listMovementsQuerySchema = z.object({
  ...listQueryBase,
  itemId: objectId.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type RecordMovementInput = z.infer<typeof recordMovementSchema>;
