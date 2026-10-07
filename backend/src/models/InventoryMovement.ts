import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * RECEIVE  — stock arrives (purchase, donation).            +quantity
 * ISSUE    — handed out to a person, class or department.   -quantity
 * RETURN   — something issued comes back.                   +quantity
 * WRITE_OFF — broken, lost, expired, consumed.              -quantity
 * ADJUST   — a physical count disagrees with the books; the
 *            signed difference is recorded, never the count. ±quantity
 */
export const MOVEMENT_TYPES = ['RECEIVE', 'ISSUE', 'RETURN', 'WRITE_OFF', 'ADJUST'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * The stock ledger. Append-only: a mistake is corrected by a new ADJUST
 * movement, never by editing or deleting a row, so the history an auditor
 * sees is the history that happened. There is deliberately no update or
 * delete endpoint for this collection.
 */
const inventoryMovementSchema = createTenantSchema({
  itemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  type: { type: String, enum: MOVEMENT_TYPES, required: true },
  /** Signed change applied to quantityOnHand. Never 0. */
  quantityChange: { type: Number, required: true },
  /** quantityOnHand after this movement — lets the ledger be read without replaying it. */
  balanceAfter: { type: Number, required: true, min: 0 },
  unitCostMinor: { type: Number, min: 0 },
  /** Who or what received an ISSUE / sent a RETURN: "Grade 5-A", "Science dept", a person. */
  party: { type: String, trim: true },
  /** Invoice, delivery note or requisition number. */
  reference: { type: String, trim: true },
  note: { type: String, trim: true },
  occurredAt: { type: Date, required: true, default: () => new Date() },
  recordedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

// Ledger for one item, newest first — the item detail screen.
inventoryMovementSchema.index({ schoolId: 1, itemId: 1, occurredAt: -1 });
// The school-wide movement log, filterable by type.
inventoryMovementSchema.index({ schoolId: 1, deletedAt: 1, type: 1, occurredAt: -1 });

export interface InventoryMovementDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  itemId: Types.ObjectId;
  type: MovementType;
  quantityChange: number;
  balanceAfter: number;
  unitCostMinor?: number;
  party?: string;
  reference?: string;
  note?: string;
  occurredAt: Date;
  recordedByUserId: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const InventoryMovement = model<InventoryMovementDoc>('InventoryMovement', inventoryMovementSchema);
