import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * What a class pays in a session: one amount per fee head. One structure per
 * class per session — enforced in fees.service rather than by a unique index,
 * since a duplicate is recoverable (archive one) and the index would make the
 * cross-tenant probes collide on their own fixtures.
 *
 * Money is integer minor units (CLAUDE.md).
 */
const structureItemSchema = new Schema(
  {
    feeHeadId: { type: Schema.Types.ObjectId, ref: 'FeeHead', required: true },
    amountMinor: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const feeStructureSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  academicSessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  items: { type: [structureItemSchema], default: [] },
});

feeStructureSchema.index({ schoolId: 1, deletedAt: 1, academicSessionId: 1, classId: 1 });

export interface FeeStructureDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  academicSessionId: Types.ObjectId;
  classId: Types.ObjectId;
  items: { feeHeadId: Types.ObjectId; amountMinor: number }[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const FeeStructure = model<FeeStructureDoc>('FeeStructure', feeStructureSchema);
