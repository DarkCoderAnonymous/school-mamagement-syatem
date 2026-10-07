import { z } from 'zod';
import { STAFF_ATTENDANCE_STATUSES } from '../../models/StaffAttendance';
import { objectId } from '../../utils/query';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const staffRegisterQuerySchema = z.object({ date: day.optional() });

export const saveStaffRegisterSchema = z.object({
  date: day,
  entries: z
    .array(
      z.object({
        employeeId: objectId,
        status: z.enum(STAFF_ATTENDANCE_STATUSES),
        remark: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, 'Mark at least one person')
    .max(500),
});

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a YYYY-MM month');

export const staffSummaryQuerySchema = z.object({ month });

/** One employee's month; omitted means the school's current month. */
export const employeeAttendanceQuerySchema = z.object({ month: month.optional() });

export type SaveStaffRegisterInput = z.infer<typeof saveStaffRegisterSchema>;
