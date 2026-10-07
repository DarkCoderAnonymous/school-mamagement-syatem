import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import * as c from './staff-attendance.controller';
import { idParamsSchema } from '../../utils/query';
import {
  employeeAttendanceQuerySchema,
  saveStaffRegisterSchema,
  staffRegisterQuerySchema,
  staffSummaryQuerySchema,
} from './staff-attendance.validation';

/**
 * The office's daily staff register. Same school calendar as the student
 * register (no register on days off); any day up to today can be taken or
 * corrected by whoever holds `staff.attendance.mark`.
 *
 * @openapi
 * /staff-attendance/register:
 *   get: { summary: "The staff register for a day (optional date)", tags: [Staff attendance], security: [{ bearerAuth: [] }] }
 *   put: { summary: "Take or correct the staff register for a day", tags: [Staff attendance], security: [{ bearerAuth: [] }] }
 * /staff-attendance/summary:
 *   get: { summary: "Each person's month: days per status and unpaid days (month=YYYY-MM)", tags: [Staff attendance], security: [{ bearerAuth: [] }] }
 * /staff-attendance/employees/{id}:
 *   get: { summary: "One employee's month day by day, with month and year-to-date totals (optional month=YYYY-MM)", tags: [Staff attendance], security: [{ bearerAuth: [] }] }
 */
const router = Router();
router.use(authenticate);
router.get('/register', requirePermission(Permission.STAFF_ATTENDANCE_READ), validate({ query: staffRegisterQuerySchema }), c.registerHandler);
router.put('/register', requirePermission(Permission.STAFF_ATTENDANCE_MARK), validate({ body: saveStaffRegisterSchema }), c.saveRegisterHandler);
router.get('/summary', requirePermission(Permission.STAFF_ATTENDANCE_READ), validate({ query: staffSummaryQuerySchema }), c.summaryHandler);
router.get(
  '/employees/:id',
  requirePermission(Permission.STAFF_ATTENDANCE_READ),
  validate({ params: idParamsSchema, query: employeeAttendanceQuerySchema }),
  c.employeeAttendanceHandler,
);

export default router;
