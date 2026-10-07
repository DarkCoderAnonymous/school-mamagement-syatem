import type { Request, Response } from 'express';
import { Permission } from '@sms/shared';
import { actorFrom } from '../../utils/actor';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as service from './attendance.service';
import * as holidays from './holidays.service';
import { getAttendanceSettings, updateAttendanceSettings } from '../../services/school-calendar.service';
import type { AttendanceSettingsInput, HolidayInput, SaveRegisterInput } from './attendance.validation';

function viewerFrom(req: Request): service.AttendanceViewer {
  const { sub, isSuperAdmin, permissions } = req.user!;
  return {
    userId: sub,
    canMark: isSuperAdmin || permissions.includes(Permission.ATTENDANCE_MARK),
    canManage: isSuperAdmin || permissions.includes(Permission.ATTENDANCE_MANAGE),
  };
}

export async function boardHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getBoard(req.query as { date?: string; mine?: string }, viewerFrom(req)));
}
export async function registerHandler(req: Request, res: Response): Promise<void> {
  const { sectionId, date } = req.query as { sectionId: string; date?: string };
  ok(res, await service.getRegister(sectionId, date, viewerFrom(req)));
}
export async function studentAttendanceHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getStudentAttendance(req.params.id as string, (req.query as { month?: string }).month));
}
export async function saveRegisterHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.saveRegister(req.body as SaveRegisterInput, viewerFrom(req), actorFrom(req)));
}

export async function getSettingsHandler(_req: Request, res: Response): Promise<void> {
  ok(res, await getAttendanceSettings());
}
export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  ok(res, await updateAttendanceSettings(req.body as AttendanceSettingsInput, actorFrom(req)));
}
export async function listHolidaysHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await holidays.listHolidays(req.query as Record<string, unknown>);
  paginated(res, items, meta);
}
export async function createHolidayHandler(req: Request, res: Response): Promise<void> {
  created(res, await holidays.createHoliday(req.body as HolidayInput, actorFrom(req)));
}
export async function updateHolidayHandler(req: Request, res: Response): Promise<void> {
  ok(res, await holidays.updateHoliday(req.params.id as string, req.body as Partial<HolidayInput>, actorFrom(req)));
}
export async function deleteHolidayHandler(req: Request, res: Response): Promise<void> {
  await holidays.deleteHoliday(req.params.id as string, actorFrom(req));
  noContent(res);
}
export async function monthlyRegisterHandler(req: Request, res: Response): Promise<void> {
  const { sectionId, month } = req.query as { sectionId: string; month: string };
  ok(res, await service.getMonthlyRegister(sectionId, month));
}
