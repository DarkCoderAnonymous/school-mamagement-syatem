import { Holiday } from '../../models/Holiday';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { buildPaginationMeta } from '../../utils/response';
import { calendarDay } from '../../utils/school-time';
import type { HolidayInput } from './attendance.validation';

const DAY_MS = 86_400_000;
const MAX_SPAN_DAYS = 90;

/** Holidays overlapping `from`..`to` (either may be omitted), earliest first. */
export async function listHolidays(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (typeof query.from === 'string') filter.endDate = { $gte: calendarDay(query.from) };
  if (typeof query.to === 'string') filter.startDate = { $lte: calendarDay(query.to) };
  const [items, total] = await Promise.all([
    Holiday.find(filter).sort({ startDate: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    Holiday.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

function toDates(input: Pick<HolidayInput, 'startDate' | 'endDate'>) {
  const startDate = calendarDay(input.startDate);
  const endDate = calendarDay(input.endDate ?? input.startDate);
  if (endDate < startDate) throw AppError.badRequest('The last day must be on or after the first day', { field: 'endDate' });
  if ((endDate.getTime() - startDate.getTime()) / DAY_MS >= MAX_SPAN_DAYS) {
    throw AppError.badRequest(`A holiday can span at most ${MAX_SPAN_DAYS} days`, { field: 'endDate' });
  }
  return { startDate, endDate };
}

export async function createHoliday(input: HolidayInput, actor: ActorMeta) {
  const created = await Holiday.create({ schoolId: actor.schoolId, name: input.name, ...toDates(input) });
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'holiday.create',
    entity: 'Holiday',
    entityId: created._id,
    after: created.toObject(),
    ip: actor.ip,
  });
  return created.toObject();
}

export async function updateHoliday(id: string, input: Partial<HolidayInput>, actor: ActorMeta) {
  const holiday = await Holiday.findOne({ _id: id, deletedAt: null });
  if (!holiday) throw AppError.notFound('Holiday not found');
  const before = holiday.toObject();
  const dates = toDates({
    startDate: input.startDate ?? before.startDate.toISOString(),
    endDate: input.endDate ?? (input.startDate && !input.endDate ? input.startDate : before.endDate.toISOString()),
  });
  if (input.name !== undefined) holiday.name = input.name;
  holiday.startDate = dates.startDate;
  holiday.endDate = dates.endDate;
  await holiday.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'holiday.update',
    entity: 'Holiday',
    entityId: holiday._id,
    before,
    after: holiday.toObject(),
    ip: actor.ip,
  });
  return holiday.toObject();
}

export async function deleteHoliday(id: string, actor: ActorMeta): Promise<void> {
  const holiday = await Holiday.findOne({ _id: id, deletedAt: null });
  if (!holiday) throw AppError.notFound('Holiday not found');
  const before = holiday.toObject();
  holiday.deletedAt = new Date();
  await holiday.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'holiday.delete',
    entity: 'Holiday',
    entityId: holiday._id,
    before,
    after: holiday.toObject(),
    ip: actor.ip,
  });
}
