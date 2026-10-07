import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import * as c from './attendance.controller';
import { idParamsSchema } from '../../utils/query';
import {
  attendanceSettingsSchema,
  boardQuerySchema,
  holidaySchema,
  listHolidaysQuerySchema,
  monthlyRegisterQuerySchema,
  registerQuerySchema,
  saveRegisterSchema,
  studentAttendanceQuerySchema,
  updateHolidaySchema,
} from './attendance.validation';

/**
 * The daily register, one per section per school day. Saving needs
 * `attendance.mark`; which sections and days are then allowed is decided in
 * the service (class teacher / teaching assignment, today only — or anything
 * with `attendance.manage`).
 *
 * @openapi
 * /attendance/board:
 *   get: { summary: "Every section's register progress for a day (optional date, mine)", tags: [Attendance], security: [{ bearerAuth: [] }] }
 * /attendance/register:
 *   get: { summary: "One section's register for a day (sectionId, optional date)", tags: [Attendance], security: [{ bearerAuth: [] }] }
 *   put: { summary: "Mark or correct a section's register for a day", tags: [Attendance], security: [{ bearerAuth: [] }] }
 * /attendance/monthly:
 *   get: { summary: "A section's month as a grid: students × days, with totals (sectionId, month=YYYY-MM)", tags: [Attendance], security: [{ bearerAuth: [] }] }
 * /attendance/students/{id}:
 *   get: { summary: "One student's month day by day (optional month=YYYY-MM), with month and session totals", tags: [Attendance], security: [{ bearerAuth: [] }] }
 * /attendance/settings:
 *   get: { summary: "Weekly days off and the teachers' catch-up window", tags: [Attendance], security: [{ bearerAuth: [] }] }
 *   patch: { summary: "Change the weekly days off or catch-up window", tags: [Attendance], security: [{ bearerAuth: [] }] }
 * /attendance/holidays:
 *   get: { summary: "Holidays (optional from/to)", tags: [Attendance], security: [{ bearerAuth: [] }] }
 *   post: { summary: "Add a holiday (one day, or a run of days)", tags: [Attendance], security: [{ bearerAuth: [] }] }
 * /attendance/holidays/{id}:
 *   patch: { summary: "Change a holiday", tags: [Attendance], security: [{ bearerAuth: [] }] }
 *   delete: { summary: "Remove a holiday", tags: [Attendance], security: [{ bearerAuth: [] }] }
 */
const router = Router();
router.use(authenticate);
router.get('/board', requirePermission(Permission.ATTENDANCE_READ), validate({ query: boardQuerySchema }), c.boardHandler);
router.get('/register', requirePermission(Permission.ATTENDANCE_READ), validate({ query: registerQuerySchema }), c.registerHandler);
router.get('/monthly', requirePermission(Permission.ATTENDANCE_READ), validate({ query: monthlyRegisterQuerySchema }), c.monthlyRegisterHandler);
router.get(
  '/students/:id',
  requirePermission(Permission.ATTENDANCE_READ),
  validate({ params: idParamsSchema, query: studentAttendanceQuerySchema }),
  c.studentAttendanceHandler,
);
router.put('/register', requirePermission(Permission.ATTENDANCE_MARK), validate({ body: saveRegisterSchema }), c.saveRegisterHandler);

router.get('/settings', requirePermission(Permission.ATTENDANCE_READ), c.getSettingsHandler);
router.patch('/settings', requirePermission(Permission.ATTENDANCE_MANAGE), validate({ body: attendanceSettingsSchema }), c.updateSettingsHandler);
router.get('/holidays', requirePermission(Permission.ATTENDANCE_READ), validate({ query: listHolidaysQuerySchema }), c.listHolidaysHandler);
router.post('/holidays', requirePermission(Permission.ATTENDANCE_MANAGE), validate({ body: holidaySchema }), c.createHolidayHandler);
router.patch(
  '/holidays/:id',
  requirePermission(Permission.ATTENDANCE_MANAGE),
  validate({ params: idParamsSchema, body: updateHolidaySchema }),
  c.updateHolidayHandler,
);
router.delete('/holidays/:id', requirePermission(Permission.ATTENDANCE_MANAGE), validate({ params: idParamsSchema }), c.deleteHolidayHandler);

export default router;
