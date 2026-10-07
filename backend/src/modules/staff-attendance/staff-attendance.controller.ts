import type { Request, Response } from 'express';
import { Permission } from '@sms/shared';
import { actorFrom } from '../../utils/actor';
import { ok } from '../../utils/response';
import * as service from './staff-attendance.service';
import type { SaveStaffRegisterInput } from './staff-attendance.validation';

const canMark = (req: Request) => req.user!.isSuperAdmin || req.user!.permissions.includes(Permission.STAFF_ATTENDANCE_MARK);

export async function registerHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getStaffRegister((req.query as { date?: string }).date, canMark(req)));
}
export async function saveRegisterHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.saveStaffRegister(req.body as SaveStaffRegisterInput, actorFrom(req)));
}
export async function summaryHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.staffMonthSummary((req.query as { month: string }).month));
}
export async function employeeAttendanceHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getEmployeeAttendance(req.params.id as string, (req.query as { month?: string }).month));
}
