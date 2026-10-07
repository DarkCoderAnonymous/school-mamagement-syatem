import { model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/** A grouping of stock items: "Furniture", "Science lab", "Stationery", "Sports". */
const inventoryCategorySchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
});

// Partial-filtered so a soft-deleted row stops occupying the key (CLAUDE.md).
inventoryCategorySchema.index(
  { schoolId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export interface InventoryCategoryDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  description?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const InventoryCategory = model<InventoryCategoryDoc>('InventoryCategory', inventoryCategorySchema);
