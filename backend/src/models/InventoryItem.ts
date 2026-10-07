import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const INVENTORY_UNITS = ['PIECE', 'BOX', 'PACK', 'SET', 'REAM', 'KG', 'LITRE', 'METRE', 'PAIR'] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

/**
 * One kind of thing the school keeps in stock.
 *
 * `quantityOnHand` is a running balance maintained ONLY by
 * inventory.service's movement functions, inside the same transaction that
 * writes the InventoryMovement ledger row — the ledger is the history, this
 * field is its cached sum. Never set it from an item create/update payload.
 *
 * Money is integer minor units (CLAUDE.md).
 */
const inventoryItemSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  /** Per-school stock code, issued by the sequence service (ITM-0001). */
  sku: { type: String, required: true, trim: true, uppercase: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'InventoryCategory', required: true },
  unit: { type: String, enum: INVENTORY_UNITS, default: 'PIECE' },
  quantityOnHand: { type: Number, required: true, default: 0, min: 0 },
  /** At or below this, the item shows as low stock. 0 disables the alert. */
  reorderLevel: { type: Number, default: 0, min: 0 },
  unitCostMinor: { type: Number, default: 0, min: 0 },
  location: { type: String, trim: true },
  description: { type: String, trim: true },
});

inventoryItemSchema.index(
  { schoolId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
inventoryItemSchema.index(
  { schoolId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// Item list: filtered by category, sorted by name.
inventoryItemSchema.index({ schoolId: 1, deletedAt: 1, categoryId: 1, name: 1 });

export interface InventoryItemDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  sku: string;
  categoryId: Types.ObjectId;
  unit: InventoryUnit;
  quantityOnHand: number;
  reorderLevel: number;
  unitCostMinor: number;
  location?: string;
  description?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const InventoryItem = model<InventoryItemDoc>('InventoryItem', inventoryItemSchema);
