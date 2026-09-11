import { School } from '../../../models/School';
import { AppError } from '../../../utils/AppError';
import { buildPaginationMeta } from '../../../utils/response';
import { parsePaginationQuery } from '../../../utils/paginate';
import { recordAudit } from '../../../utils/audit';

interface ActorMeta {
  actorUserId: string;
  ip?: string;
}

/**
 * SUPER_ADMIN-only cross-school listing. School is a platform (not
 * tenant-scoped) collection so this aggregate needs no manual $match — see
 * CLAUDE.md's aggregate-scoping rule, which applies to tenant collections.
 */
export async function listSchools(query: Record<string, unknown>) {
  const { page, limit, skip, sort, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (typeof query.status === 'string') filter.status = query.status;
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { slug: new RegExp(search, 'i') }];

  const [items, total] = await Promise.all([
    School.aggregate([
      { $match: filter },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'subscriptions',
          let: { schoolId: '$_id' },
          pipeline: [{ $match: { $expr: { $eq: ['$schoolId', '$$schoolId'] } } }, { $sort: { createdAt: -1 } }, { $limit: 1 }],
          as: 'subscription',
        },
      },
      { $unwind: { path: '$subscription', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          let: { schoolId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$schoolId', '$$schoolId'] }, deletedAt: null } },
            { $count: 'count' },
          ],
          as: 'userCount',
        },
      },
      { $addFields: { userCount: { $ifNull: [{ $first: '$userCount.count' }, 0] } } },
    ]),
    School.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getSchoolById(id: string) {
  const school = await School.findById(id).lean();
  if (!school) throw AppError.notFound('School not found');
  return school;
}

export async function updateSchoolStatus(id: string, status: string, actor: ActorMeta) {
  const school = await School.findById(id);
  if (!school) throw AppError.notFound('School not found');

  const before = school.status;
  school.status = status as typeof school.status;
  await school.save();

  await recordAudit({
    schoolId: school._id,
    actorUserId: actor.actorUserId,
    action: 'school.status.update',
    entity: 'School',
    entityId: school._id,
    before: { status: before },
    after: { status },
    ip: actor.ip,
  });

  return school;
}
