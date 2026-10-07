import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * One student's attendance on one school day — the daily register, one row
 * per student rather than one document per section, because a student's
 * history (their record, the parent app) is read on its own.
 *
 * `date` is a calendar day stored as UTC midnight (utils/school-time).
 * The class, section and session are the ones the student was in THAT day,
 * copied when marked, so a later section change doesn't move old registers.
 */
const attendanceSchema = createTenantSchema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  academicSessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ATTENDANCE_STATUSES, required: true },
  remark: { type: String, trim: true, maxlength: 200 },
  markedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

// One row per student per day. Partial so a soft-deleted row doesn't block re-marking.
attendanceSchema.index(
  { schoolId: 1, studentId: 1, date: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// A section's register for a day, and the day's board across sections.
attendanceSchema.index({ schoolId: 1, deletedAt: 1, date: 1, sectionId: 1 });
// A student's history, newest first.
attendanceSchema.index({ schoolId: 1, deletedAt: 1, studentId: 1, date: -1 });

export interface AttendanceDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  studentId: Types.ObjectId;
  sectionId: Types.ObjectId;
  classId: Types.ObjectId;
  academicSessionId: Types.ObjectId;
  date: Date;
  status: AttendanceStatus;
  remark?: string;
  markedByUserId: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Attendance = model<AttendanceDoc>('Attendance', attendanceSchema);
