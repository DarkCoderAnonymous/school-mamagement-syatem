import { Schema, InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

/** Base staff record. Teachers additionally get a Teacher document (see Teacher.ts). */
const employeeSchema = createTenantSchema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  employeeNumber: { type: String, required: true, trim: true },
  designation: { type: String, required: true, trim: true },
  department: { type: String, trim: true },
  joiningDate: { type: Date, required: true },
  status: { type: String, enum: ['ACTIVE', 'ON_LEAVE', 'TERMINATED'], default: 'ACTIVE' },
});

// Partial-filtered so a soft-deleted row stops occupying the key: deletes are
// soft, so without this the value could never be reused (CLAUDE.md).
employeeSchema.index(
  { schoolId: 1, employeeNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export type EmployeeDoc = InferSchemaType<typeof employeeSchema>;
export const Employee = model('Employee', employeeSchema);
