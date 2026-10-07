import { z } from 'zod';
import { ATTENDANCE_STATUSES } from '../../models/Attendance';
import { listQueryBase, objectId } from '../../utils/query';

/** A calendar day, "YYYY-MM-DD". Omitted means today in the school's timezone. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const boardQuerySchema = z.object({
  date: day.optional(),
  /** Only the sections the caller teaches or is class teacher of. */
  mine: z.enum(['true', 'false']).optional(),
});

export const registerQuerySchema = z.object({
  sectionId: objectId,
  date: day.optional(),
});

export const monthlyRegisterQuerySchema = z.object({
  sectionId: objectId,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a YYYY-MM month'),
});

/** Omitted month means the school's current one. */
export const studentAttendanceQuerySchema = z.object({ month: monthlyRegisterQuerySchema.shape.month.optional() });

export const saveRegisterSchema = z.object({
  sectionId: objectId,
  date: day,
  entries: z
    .array(
      z.object({
        studentId: objectId,
        status: z.enum(ATTENDANCE_STATUSES),
        remark: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, 'Mark at least one student')
    .max(300),
});

export type SaveRegisterInput = z.infer<typeof saveRegisterSchema>;

export const attendanceSettingsSchema = z
  .object({
    weeklyOffDays: z.array(z.number().int().min(0).max(6)).max(6, 'At least one day a week must be a school day').optional(),
    teacherBackdateDays: z.number().int().min(0).max(7).optional(),
  })
  .refine((v) => v.weeklyOffDays !== undefined || v.teacherBackdateDays !== undefined, { message: 'Nothing to update' });

export const listHolidaysQuerySchema = z.object({ ...listQueryBase, from: day.optional(), to: day.optional() });

export const holidaySchema = z.object({
  name: z.string().trim().min(1, 'Name the holiday').max(80),
  startDate: day,
  /** Omit for a one-day holiday. */
  endDate: day.optional(),
});
export const updateHolidaySchema = holidaySchema.partial().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export type HolidayInput = z.infer<typeof holidaySchema>;
export type AttendanceSettingsInput = z.infer<typeof attendanceSettingsSchema>;
