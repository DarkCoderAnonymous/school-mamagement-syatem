import mongoose from 'mongoose';
import { AcademicSession } from '../../models/AcademicSession';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { parsePaginationQuery } from '../../utils/paginate';
import { recordAudit } from '../../utils/audit';
import { restrictSort, searchRegex } from '../../utils/query';

/** Sortable columns (the sessions table sorts by name and dates). */
const SESSION_SORT_FIELDS = ['name', 'startDate', 'endDate', 'createdAt'] as const;
import type { CreateAcademicSessionInput, UpdateAcademicSessionInput } from './academic-sessions.validation';

export interface ActorMeta {
  actorUserId: string;
  schoolId: string | null;
  ip?: string;
}

/**
 * Every query here relies on the tenant plugin to inject `schoolId` from the
 * AsyncLocalStorage context (see tenant/tenant.plugin.ts) — services never
 * pass it by hand, and a caller-supplied schoolId would be overridden anyway.
 * `deletedAt: null` IS explicit, because the plugin deliberately does not
 * filter soft-deletes (audit/reporting queries need them).
 */
export async function listAcademicSessions(query: Record<string, unknown>) {
  const { page, limit, skip, sort, search } = parsePaginationQuery(query);

  const filter: Record<string, unknown> = { deletedAt: null };
  if (search) filter.name = searchRegex(search);
  if (typeof query.isCurrent === 'boolean') filter.isCurrent = query.isCurrent;

  const [items, total] = await Promise.all([
    AcademicSession.find(filter).sort(restrictSort(sort, SESSION_SORT_FIELDS, { createdAt: -1 })).skip(skip).limit(limit).lean(),
    AcademicSession.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getAcademicSessionById(id: string) {
  const session = await AcademicSession.findOne({ _id: id, deletedAt: null }).lean();
  if (!session) throw AppError.notFound('Academic session not found');
  return session;
}

/** The one session marked current, or null before setup. */
export async function getCurrentAcademicSession() {
  return AcademicSession.findOne({ isCurrent: true, deletedAt: null }).lean();
}

/**
 * "Current" is a singleton per school, so promoting one must demote the rest.
 * Both writes go in a transaction: a failure between them would leave a school
 * with two current sessions (or none), and every downstream module —
 * attendance, marks, fees — resolves "this year" through exactly this flag.
 */
async function setCurrentWithin(
  sessionId: mongoose.Types.ObjectId,
  dbSession: mongoose.ClientSession,
): Promise<void> {
  await AcademicSession.updateMany(
    { _id: { $ne: sessionId }, isCurrent: true, deletedAt: null },
    { $set: { isCurrent: false } },
    { session: dbSession },
  );
}

export async function createAcademicSession(input: CreateAcademicSessionInput, actor: ActorMeta) {
  const existing = await AcademicSession.findOne({ name: input.name, deletedAt: null }).lean();
  if (existing) throw AppError.conflict(`An academic session named "${input.name}" already exists`);

  const dbSession = await mongoose.startSession();
  let createdId: mongoose.Types.ObjectId | undefined;

  try {
    await dbSession.withTransaction(async () => {
      const [created] = await AcademicSession.create(
        [
          {
            schoolId: actor.schoolId,
            name: input.name,
            startDate: input.startDate,
            endDate: input.endDate,
            isCurrent: input.isCurrent,
          },
        ],
        { session: dbSession },
      );
      if (!created) throw AppError.internal('Failed to create academic session');
      createdId = created._id;

      if (input.isCurrent) await setCurrentWithin(created._id, dbSession);

      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'academicSession.create',
        entity: 'AcademicSession',
        entityId: created._id,
        after: created.toObject(),
        ip: actor.ip,
        session: dbSession,
      });
    });
  } finally {
    await dbSession.endSession();
  }

  if (!createdId) throw AppError.internal('Academic session transaction produced no result');
  return getAcademicSessionById(String(createdId));
}

export async function updateAcademicSession(
  id: string,
  input: UpdateAcademicSessionInput,
  actor: ActorMeta,
) {
  const before = await AcademicSession.findOne({ _id: id, deletedAt: null });
  if (!before) throw AppError.notFound('Academic session not found');

  // Range coherence has to be re-checked against the stored values: a patch
  // that only moves startDate can still invert the range.
  const nextStart = input.startDate ?? before.startDate;
  const nextEnd = input.endDate ?? before.endDate;
  if (nextEnd <= nextStart) {
    throw AppError.badRequest('End date must be after the start date', { field: 'endDate' });
  }

  if (input.name && input.name !== before.name) {
    const clash = await AcademicSession.findOne({ name: input.name, _id: { $ne: id }, deletedAt: null }).lean();
    if (clash) throw AppError.conflict(`An academic session named "${input.name}" already exists`);
  }

  const beforeSnapshot = before.toObject();
  const dbSession = await mongoose.startSession();

  try {
    await dbSession.withTransaction(async () => {
      Object.assign(before, input);
      await before.save({ session: dbSession });

      if (input.isCurrent === true) await setCurrentWithin(before._id, dbSession);

      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'academicSession.update',
        entity: 'AcademicSession',
        entityId: before._id,
        before: beforeSnapshot,
        after: before.toObject(),
        ip: actor.ip,
        session: dbSession,
      });
    });
  } finally {
    await dbSession.endSession();
  }

  return getAcademicSessionById(id);
}

/**
 * Soft delete (CLAUDE.md). Refuses to archive the current session: doing so
 * would leave the school with no "this year", which every other module reads.
 */
export async function deleteAcademicSession(id: string, actor: ActorMeta) {
  const session = await AcademicSession.findOne({ _id: id, deletedAt: null });
  if (!session) throw AppError.notFound('Academic session not found');
  if (session.isCurrent) {
    throw AppError.conflict('Set another session as current before archiving this one');
  }

  const beforeSnapshot = session.toObject();
  session.deletedAt = new Date();
  await session.save();

  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'academicSession.delete',
    entity: 'AcademicSession',
    entityId: session._id,
    before: beforeSnapshot,
    after: session.toObject(),
    ip: actor.ip,
  });
}
