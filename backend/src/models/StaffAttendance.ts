import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const STAFF_ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'UNPAID_LEAVE'] as const;
export type StaffAttendanceStatus = (typeof STAFF_ATTENDANCE_STATUSES)[number];

/**
 * How many days of pay a status costs. LEAVE is paid leave (costs nothing);
 * the payroll draft sums these per month into each payslip's unpaid days.
 */
export const UNPAID_WEIGHT: Record<StaffAttendanceStatus, number> = {
  PRESENT: 0,
  LATE: 0,
  LEAVE: 0,
  HALF_DAY: 0.5,
  ABSENT: 1,
  UNPAID_LEAVE: 1,
};

/**
 * One employee's attendance on one school day — the office's daily staff
 * register. One row per employee rather than one document per day, because
 * an employee's month is read on its own (payroll, their record).
 * `date` is a calendar day stored as UTC midnight (utils/school-time).
 */
const staffAttendanceSchema = createTenantSchema({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: STAFF_ATTENDANCE_STATUSES, required: true },
  remark: { type: String, trim: true, maxlength: 200 },
  markedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

// One row per employee per day. Partial so a soft-deleted row doesn't block re-marking.
staffAttendanceSchema.index(
  { schoolId: 1, employeeId: 1, date: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// The day's register.
staffAttendanceSchema.index({ schoolId: 1, deletedAt: 1, date: 1 });
// An employee's month (payroll) and history.
staffAttendanceSchema.index({ schoolId: 1, deletedAt: 1, employeeId: 1, date: -1 });

export interface StaffAttendanceDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  employeeId: Types.ObjectId;
  date: Date;
  status: StaffAttendanceStatus;
  remark?: string;
  markedByUserId: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const StaffAttendance = model<StaffAttendanceDoc>('StaffAttendance', staffAttendanceSchema);
