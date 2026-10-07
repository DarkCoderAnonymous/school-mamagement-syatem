import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'TERMINATED'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

/**
 * Base staff record. Teachers additionally get a Teacher document (see Teacher.ts).
 *
 * Name and contact are DENORMALISED from the global User (ADR-001): staff
 * lists are searched and sorted by name inside one school, and doing that
 * through User would mean a regex over every person on the platform. The
 * User stays the source of truth for sign-in; these are the school's record
 * of the person, the same way an HR file keeps its own copy.
 */
const employeeSchema = createTenantSchema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  employeeNumber: { type: String, required: true, trim: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  designation: { type: String, required: true, trim: true },
  department: { type: String, trim: true },
  joiningDate: { type: Date, required: true },
  status: { type: String, enum: EMPLOYEE_STATUSES, default: 'ACTIVE' },
});

// Partial-filtered so a soft-deleted row stops occupying the key: deletes are
// soft, so without this the value could never be reused (CLAUDE.md).
employeeSchema.index(
  { schoolId: 1, employeeNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// Staff lists: filter by status, sort by name.
employeeSchema.index({ schoolId: 1, deletedAt: 1, status: 1, lastName: 1, firstName: 1 });
employeeSchema.index({ schoolId: 1, userId: 1 });

export interface EmployeeDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  userId: Types.ObjectId;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  designation: string;
  department?: string;
  joiningDate: Date;
  status: EmployeeStatus;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Employee = model<EmployeeDoc>('Employee', employeeSchema);
