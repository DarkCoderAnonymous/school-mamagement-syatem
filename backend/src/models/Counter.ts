import { model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * One row per (school, key) holding the last issued number in that series.
 *
 * Kept deliberately dumb: the atomicity comes from MongoDB's `$inc` inside a
 * single `findOneAndUpdate`, not from anything this schema does. See
 * services/sequence.service.ts.
 */
const counterSchema = createTenantSchema({
  /** Series name, e.g. 'admission', 'invoice', 'receipt', 'employee'. */
  key: { type: String, required: true, trim: true },
  seq: { type: Number, required: true, default: 0 },
});

// One counter per series per school, and the lookup every increment does.
// Partial-filtered so a soft-deleted row stops occupying the key: deletes are
// soft, so without this the value could never be reused (CLAUDE.md).
counterSchema.index({ schoolId: 1, key: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

export interface CounterDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  key: string;
  seq: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Counter = model<CounterDoc>('Counter', counterSchema);
