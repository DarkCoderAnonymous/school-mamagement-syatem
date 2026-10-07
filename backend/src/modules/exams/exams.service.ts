import { Types } from 'mongoose';
import { Exam } from '../../models/Exam';
import { ExamPaper, type PaperStatus } from '../../models/ExamPaper';
import { Mark } from '../../models/Mark';
import { Class } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { Student } from '../../models/Student';
import { School, type GradingBand } from '../../models/School';
import { AcademicSession } from '../../models/AcademicSession';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { assertExistsInSchool, exactRegex, listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { withTransaction } from '../../utils/transaction';
import { calendarDay } from '../../utils/school-time';
import { TenantContext } from '../../tenant/context';
import type { AddPapersInput, CreateExamInput, DateSheetInput, GradingSettingsInput, UpdateExamInput, UpdatePaperInput } from './exams.validation';

function audit(actor: ActorMeta, action: string, entity: string, entityId: Types.ObjectId | string | null, before: unknown, after: unknown) {
  return recordAudit({ schoolId: actor.schoolId, actorUserId: actor.actorUserId, action, entity, entityId, before, after, ip: actor.ip });
}

// ─── Grading ─────────────────────────────────────────────────────────────────

export const DEFAULT_GRADING_BANDS: GradingBand[] = [
  { grade: 'A+', minPercent: 90, remark: 'Outstanding' },
  { grade: 'A', minPercent: 80, remark: 'Excellent' },
  { grade: 'B', minPercent: 70, remark: 'Very good' },
  { grade: 'C', minPercent: 60, remark: 'Good' },
  { grade: 'D', minPercent: 50, remark: 'Satisfactory' },
  // E starts at the customary 33% pass mark, so a student who passes a paper never gets an F.
  { grade: 'E', minPercent: 33, remark: 'Needs improvement' },
  { grade: 'F', minPercent: 0, remark: 'Unsatisfactory' },
];

export interface ExamSettings {
  gradingBands: GradingBand[];
  showPositions: boolean;
}

export async function getExamSettings(): Promise<ExamSettings> {
  const schoolId = TenantContext.getSchoolId();
  if (!schoolId) throw AppError.forbidden('No school context');
  const school = await School.findById(schoolId).select('examSettings').lean();
  const bands = school?.examSettings?.gradingBands?.length ? school.examSettings.gradingBands : DEFAULT_GRADING_BANDS;
  return {
    gradingBands: [...bands].sort((a, b) => b.minPercent - a.minPercent),
    showPositions: school?.examSettings?.showPositions ?? true,
  };
}

export async function updateExamSettings(input: GradingSettingsInput, actor: ActorMeta) {
  const before = await getExamSettings();
  const next: ExamSettings = {
    gradingBands: input.gradingBands ?? before.gradingBands,
    showPositions: input.showPositions ?? before.showPositions,
  };
  // School is a platform document, addressed by the caller's own schoolId from the token.
  await School.updateOne({ _id: actor.schoolId }, { $set: { examSettings: next } });
  await audit(actor, 'exam.settings.update', 'School', actor.schoolId, before, next);
  return getExamSettings();
}

/** Two-decimal percentage. */
export const percent = (obtained: number, max: number) => (max > 0 ? Math.round((obtained / max) * 10_000) / 100 : 0);

/** The band a percentage falls in — bands must be sorted highest first (getExamSettings does). */
export function gradeFor(pct: number, bands: GradingBand[]): GradingBand {
  return bands.find((b) => pct >= b.minPercent) ?? bands[bands.length - 1]!;
}

// ─── Exams ───────────────────────────────────────────────────────────────────

type ExamStatus = 'SETUP' | 'IN_PROGRESS' | 'PARTLY_PUBLISHED' | 'PUBLISHED';

function examStatus(counts: Partial<Record<PaperStatus, number>>): ExamStatus {
  const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  if (total === 0) return 'SETUP';
  const published = counts.PUBLISHED ?? 0;
  if (published === total) return 'PUBLISHED';
  return published > 0 ? 'PARTLY_PUBLISHED' : 'IN_PROGRESS';
}

async function paperCounts(examIds: Types.ObjectId[]) {
  const rows = await ExamPaper.aggregate<{ _id: { examId: Types.ObjectId; status: PaperStatus }; n: number }>([
    { $match: { examId: { $in: examIds }, deletedAt: null } },
    { $group: { _id: { examId: '$examId', status: '$status' }, n: { $sum: 1 } } },
  ]);
  const map = new Map<string, Partial<Record<PaperStatus, number>>>();
  for (const r of rows) {
    const key = String(r._id.examId);
    map.set(key, { ...(map.get(key) ?? {}), [r._id.status]: r.n });
  }
  return map;
}

async function currentSessionId(requested?: string): Promise<Types.ObjectId> {
  if (requested) {
    await assertExistsInSchool(AcademicSession, requested, 'Academic session', 'academicSessionId');
    return new Types.ObjectId(requested);
  }
  const current = await AcademicSession.findOne({ isCurrent: true, deletedAt: null }).select('_id').lean();
  if (!current) throw AppError.badRequest('Set a current academic session first', { field: 'academicSessionId' });
  return current._id;
}

export async function listExams(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (typeof query.type === 'string') filter.type = query.type;
  filter.academicSessionId =
    typeof query.academicSessionId === 'string' ? query.academicSessionId : await currentSessionId().catch(() => undefined);
  if (!filter.academicSessionId) delete filter.academicSessionId;
  if (search) filter.name = searchRegex(search);

  const [items, total] = await Promise.all([
    Exam.find(filter).sort(listSort(query, ['startDate', 'name', 'createdAt'], { startDate: -1 })).skip(skip).limit(limit).lean(),
    Exam.countDocuments(filter),
  ]);
  const counts = await paperCounts(items.map((e) => e._id));
  return {
    items: items.map((e) => {
      const c = counts.get(String(e._id)) ?? {};
      return { ...e, paperCounts: c, paperTotal: Object.values(c).reduce((s, n) => s + (n ?? 0), 0), status: examStatus(c) };
    }),
    meta: buildPaginationMeta(page, limit, total),
  };
}

/**
 * The exam with its whole date sheet: every paper with how many of the
 * class's students have a mark (or are marked absent) — the progress the
 * exam controller watches before publishing.
 */
export async function getExam(id: string) {
  const exam = await Exam.findOne({ _id: id, deletedAt: null }).populate({ path: 'academicSessionId', select: 'name' }).lean();
  if (!exam) throw AppError.notFound('Exam not found');
  const papers = await ExamPaper.find({ examId: exam._id, deletedAt: null })
    .populate([
      { path: 'classId', select: 'name order' },
      { path: 'subjectId', select: 'name code' },
    ])
    .lean();

  const classIds = [...new Set(papers.map((p) => String((p.classId as unknown as { _id: Types.ObjectId })?._id)))].map((x) => new Types.ObjectId(x));
  const [entered, strength] = await Promise.all([
    Mark.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { examId: exam._id, deletedAt: null, $or: [{ marksObtained: { $ne: null } }, { isAbsent: true }] } },
      { $group: { _id: '$examPaperId', n: { $sum: 1 } } },
    ]),
    Student.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { classId: { $in: classIds }, status: 'ACTIVE', deletedAt: null } },
      { $group: { _id: '$classId', n: { $sum: 1 } } },
    ]),
  ]);
  const enteredBy = new Map(entered.map((e) => [String(e._id), e.n]));
  const strengthBy = new Map(strength.map((s) => [String(s._id), s.n]));

  const rows = papers
    .map((p) => {
      const cls = p.classId as unknown as { _id: Types.ObjectId; name: string; order?: number };
      return { ...p, marksEntered: enteredBy.get(String(p._id)) ?? 0, classStrength: strengthBy.get(String(cls?._id)) ?? 0 };
    })
    .sort((a, b) => {
      const ca = a.classId as unknown as { order?: number; name: string };
      const cb = b.classId as unknown as { order?: number; name: string };
      return (ca?.order ?? 0) - (cb?.order ?? 0) || String(a.date ?? '').localeCompare(String(b.date ?? ''));
    });

  const counts: Partial<Record<PaperStatus, number>> = {};
  for (const p of rows) counts[p.status] = (counts[p.status] ?? 0) + 1;
  return { ...exam, papers: rows, paperCounts: counts, status: examStatus(counts) };
}

export async function createExam(input: CreateExamInput, actor: ActorMeta) {
  const academicSessionId = await currentSessionId(input.academicSessionId);
  const clash = await Exam.findOne({ academicSessionId, name: exactRegex(input.name), deletedAt: null }).lean();
  if (clash) throw AppError.conflict(`There's already an exam called "${input.name}" this session`, { field: 'name' });
  const { dateSheet, ...fields } = input;
  const startDate = calendarDay(fields.startDate);
  const endDate = calendarDay(fields.endDate);

  // The date sheet is checked in full before anything is written.
  const papers: { classId: string; subjectId: string; date: Date | null; startTime?: string; durationMinutes?: number; maxMarks: number; passMarks: number }[] = [];
  if (dateSheet) {
    const classIds = [...new Set(dateSheet.classIds)];
    if ((await Class.countDocuments({ _id: { $in: classIds }, academicSessionId, deletedAt: null })) !== classIds.length) {
      throw AppError.badRequest("One or more grades aren't in this session", { field: 'dateSheet' });
    }
    const subjectIds = dateSheet.papers.map((p) => p.subjectId);
    const subjects = await Subject.find({ _id: { $in: subjectIds }, deletedAt: null }).select('name').lean();
    if (subjects.length !== subjectIds.length) throw AppError.badRequest('One or more subjects were not found', { field: 'dateSheet' });
    const subjectName = new Map(subjects.map((s) => [String(s._id), s.name]));
    for (const p of dateSheet.papers) {
      const day = p.date ? calendarDay(p.date) : null;
      if (day && (day < startDate || day > endDate)) {
        throw AppError.badRequest(`${subjectName.get(p.subjectId)}: the date must fall within the exam dates`, { field: 'dateSheet', subjectId: p.subjectId });
      }
      for (const classId of classIds) {
        papers.push({
          classId,
          subjectId: p.subjectId,
          date: day,
          maxMarks: p.maxMarks,
          passMarks: p.passMarks,
          ...(p.startTime ? { startTime: p.startTime } : {}),
          ...(p.durationMinutes ? { durationMinutes: p.durationMinutes } : {}),
        });
      }
    }
  }

  const created = await withTransaction(async (session) => {
    const [exam] = await Exam.create(
      [{ schoolId: actor.schoolId, ...fields, startDate, endDate, academicSessionId, createdByUserId: actor.actorUserId }],
      { session },
    );
    if (papers.length) {
      await ExamPaper.create(
        papers.map((p) => ({ schoolId: actor.schoolId, examId: exam!._id, ...p })),
        { session, ordered: true },
      );
    }
    return exam!;
  }).catch((err: unknown) => {
    if ((err as { code?: number }).code === 11000) throw AppError.conflict(`There's already an exam called "${input.name}" this session`, { field: 'name' });
    throw err;
  });
  await audit(actor, 'exam.create', 'Exam', created._id, null, {
    ...created.toObject(),
    ...(dateSheet ? { dateSheet: { classIds: dateSheet.classIds, papers: dateSheet.papers, created: papers.length } } : {}),
  });
  return getExam(String(created._id));
}

export async function updateExam(id: string, input: UpdateExamInput, actor: ActorMeta) {
  const exam = await Exam.findOne({ _id: id, deletedAt: null });
  if (!exam) throw AppError.notFound('Exam not found');
  if (input.name && input.name !== exam.name) {
    const clash = await Exam.findOne({ academicSessionId: exam.academicSessionId, name: exactRegex(input.name), deletedAt: null, _id: { $ne: exam._id } }).lean();
    if (clash) throw AppError.conflict(`There's already an exam called "${input.name}" this session`, { field: 'name' });
  }
  const start = input.startDate ? calendarDay(input.startDate) : exam.startDate;
  const end = input.endDate ? calendarDay(input.endDate) : exam.endDate;
  if (end < start) throw AppError.badRequest('The end date is before the start date', { field: 'endDate' });
  const before = exam.toObject();
  exam.set({ ...input, startDate: start, endDate: end });
  await exam.save();
  await audit(actor, 'exam.update', 'Exam', exam._id, before, exam.toObject());
  return getExam(id);
}

/** Only an exam nobody has entered marks for can be removed. */
export async function deleteExam(id: string, actor: ActorMeta) {
  const exam = await Exam.findOne({ _id: id, deletedAt: null });
  if (!exam) throw AppError.notFound('Exam not found');
  const marked = await Mark.countDocuments({ examId: exam._id, deletedAt: null, $or: [{ marksObtained: { $ne: null } }, { isAbsent: true }] });
  if (marked > 0) throw AppError.conflict(`${marked} marks have been entered for this exam — it can't be deleted`);
  const before = exam.toObject();
  await withTransaction(async (session) => {
    const now = new Date();
    await Exam.updateOne({ _id: exam._id }, { $set: { deletedAt: now } }, { session });
    await ExamPaper.updateMany({ examId: exam._id, deletedAt: null }, { $set: { deletedAt: now } }, { session });
    await Mark.updateMany({ examId: exam._id, deletedAt: null }, { $set: { deletedAt: now } }, { session });
  });
  await audit(actor, 'exam.delete', 'Exam', exam._id, before, { deletedAt: new Date() });
}

// ─── Papers (the date sheet) ─────────────────────────────────────────────────

/** Adds class × subject papers to an exam. Pairs already on the date sheet are skipped, not duplicated. */
export async function addPapers(examId: string, input: AddPapersInput, actor: ActorMeta) {
  const exam = await Exam.findOne({ _id: examId, deletedAt: null }).lean();
  if (!exam) throw AppError.notFound('Exam not found');
  const classes = await Class.find({ _id: { $in: input.classIds }, academicSessionId: exam.academicSessionId, deletedAt: null }).select('_id').lean();
  if (classes.length !== new Set(input.classIds).size) {
    throw AppError.badRequest("One or more classes aren't in this exam's session", { field: 'classIds' });
  }
  const subjectIds = input.subjects.map((s) => s.subjectId);
  if ((await Subject.countDocuments({ _id: { $in: subjectIds }, deletedAt: null })) !== subjectIds.length) {
    throw AppError.badRequest('One or more subjects were not found', { field: 'subjects' });
  }
  for (const s of input.subjects) {
    if (s.date && (calendarDay(s.date) < exam.startDate || calendarDay(s.date) > exam.endDate)) {
      throw AppError.badRequest('Paper dates must fall within the exam dates', { field: 'subjects' });
    }
  }

  const existing = await ExamPaper.find({ examId: exam._id, classId: { $in: input.classIds }, subjectId: { $in: subjectIds }, deletedAt: null })
    .select('classId subjectId')
    .lean();
  const have = new Set(existing.map((p) => `${p.classId}:${p.subjectId}`));
  const docs = input.classIds.flatMap((classId) =>
    input.subjects
      .filter((s) => !have.has(`${classId}:${s.subjectId}`))
      .map((s) => ({
        schoolId: actor.schoolId,
        examId: exam._id,
        classId,
        subjectId: s.subjectId,
        date: s.date ? calendarDay(s.date) : null,
        startTime: s.startTime,
        durationMinutes: s.durationMinutes,
        maxMarks: s.maxMarks,
        passMarks: s.passMarks,
      })),
  );
  if (docs.length) {
    try {
      await ExamPaper.insertMany(docs);
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw AppError.conflict('Some of these papers were added meanwhile — reload and try again');
      throw err;
    }
    await audit(actor, 'exam.papers.add', 'Exam', exam._id, null, { classIds: input.classIds, subjects: input.subjects, created: docs.length });
  }
  return { created: docs.length, skipped: input.classIds.length * input.subjects.length - docs.length };
}

const sameDay = (a: Date | null | undefined, b: Date | null | undefined) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * Saves one class's date sheet — the class-wise sheet a school prints
 * ("Grade 1: English, Monday 6 October…"). Listed subjects without a paper
 * get one; listed subjects with a paper have its date, time and marking
 * scheme replaced. A paper past marks entry can't be changed, and max marks
 * can't drop below a mark already given. All-or-nothing, in one transaction.
 */
export async function saveDateSheet(examId: string, classId: string, input: DateSheetInput, actor: ActorMeta) {
  const exam = await Exam.findOne({ _id: examId, deletedAt: null }).lean();
  if (!exam) throw AppError.notFound('Exam not found');
  const cls = await Class.findOne({ _id: classId, academicSessionId: exam.academicSessionId, deletedAt: null }).select('name').lean();
  if (!cls) throw AppError.notFound("Class not found in this exam's session");
  const subjectIds = input.papers.map((p) => p.subjectId);
  const subjects = await Subject.find({ _id: { $in: subjectIds }, deletedAt: null }).select('name').lean();
  if (subjects.length !== subjectIds.length) throw AppError.badRequest('One or more subjects were not found', { field: 'papers' });
  const subjectName = new Map(subjects.map((s) => [String(s._id), s.name]));

  const rows = input.papers.map((p) => ({ ...p, date: p.date ? calendarDay(p.date) : null }));
  for (const r of rows) {
    if (r.date && (r.date < exam.startDate || r.date > exam.endDate)) {
      throw AppError.badRequest(`${subjectName.get(r.subjectId)}: the date must fall within the exam dates`, { field: 'papers', subjectId: r.subjectId });
    }
  }

  const existing = await ExamPaper.find({ examId: exam._id, classId: cls._id, subjectId: { $in: subjectIds }, deletedAt: null }).lean();
  const bySubject = new Map(existing.map((p) => [String(p.subjectId), p]));
  const toCreate = rows.filter((r) => !bySubject.has(r.subjectId));
  const toUpdate = rows.flatMap((r) => {
    const p = bySubject.get(r.subjectId);
    if (!p) return [];
    const changed =
      !sameDay(p.date, r.date) ||
      (p.startTime ?? null) !== r.startTime ||
      (p.durationMinutes ?? null) !== r.durationMinutes ||
      p.maxMarks !== r.maxMarks ||
      p.passMarks !== r.passMarks;
    return changed ? [{ row: r, paper: p }] : [];
  });

  for (const { row, paper } of toUpdate) {
    const name = subjectName.get(row.subjectId);
    if (paper.status !== 'OPEN') throw AppError.conflict(`${name} is past marks entry — return it before changing its schedule`, { subjectId: row.subjectId });
    if (row.maxMarks < paper.maxMarks) {
      const over = await Mark.countDocuments({ examPaperId: paper._id, deletedAt: null, marksObtained: { $gt: row.maxMarks } });
      if (over > 0) throw AppError.conflict(`${name}: ${over} student${over === 1 ? ' has' : 's have'} more than ${row.maxMarks} already`, { subjectId: row.subjectId });
    }
  }

  const schedule = (r: (typeof rows)[number]) => ({
    date: r.date,
    maxMarks: r.maxMarks,
    passMarks: r.passMarks,
    ...(r.startTime ? { startTime: r.startTime } : {}),
    ...(r.durationMinutes ? { durationMinutes: r.durationMinutes } : {}),
  });

  await withTransaction(async (session) => {
    if (toCreate.length) {
      await ExamPaper.create(
        toCreate.map((r) => ({ schoolId: actor.schoolId, examId: exam._id, classId: cls._id, subjectId: r.subjectId, ...schedule(r) })),
        { session, ordered: true },
      );
    }
    for (const { row, paper } of toUpdate) {
      const unset = { ...(row.startTime ? {} : { startTime: 1 }), ...(row.durationMinutes ? {} : { durationMinutes: 1 }) };
      const res = await ExamPaper.updateOne(
        { _id: paper._id, status: 'OPEN', deletedAt: null },
        { $set: schedule(row), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { session },
      );
      if (res.matchedCount === 0) throw AppError.conflict(`${subjectName.get(row.subjectId)} was submitted meanwhile — reload`);
    }
  }).catch((err: unknown) => {
    if ((err as { code?: number }).code === 11000) throw AppError.conflict('This date sheet was changed meanwhile — reload and try again');
    throw err;
  });

  if (toCreate.length || toUpdate.length) {
    const pick = (p: { subjectId: unknown; date: Date | null; startTime?: string | null; durationMinutes?: number | null; maxMarks: number; passMarks: number }) => ({
      subjectId: String(p.subjectId),
      date: p.date,
      startTime: p.startTime ?? null,
      durationMinutes: p.durationMinutes ?? null,
      maxMarks: p.maxMarks,
      passMarks: p.passMarks,
    });
    await audit(
      actor,
      'exam.datesheet.save',
      'Exam',
      exam._id,
      { classId: String(cls._id), papers: toUpdate.map((u) => pick(u.paper)) },
      { classId: String(cls._id), created: toCreate.map(pick), updated: toUpdate.map((u) => pick(u.row)) },
    );
  }
  return { created: toCreate.length, updated: toUpdate.length };
}

export async function getPaper(id: string) {
  const paper = await ExamPaper.findOne({ _id: id, deletedAt: null })
    .populate([
      { path: 'examId', select: 'name type startDate endDate' },
      { path: 'classId', select: 'name' },
      { path: 'subjectId', select: 'name code' },
      { path: 'submittedByUserId', select: 'firstName lastName' },
      { path: 'verifiedByUserId', select: 'firstName lastName' },
    ])
    .lean();
  if (!paper) throw AppError.notFound('Paper not found');
  return paper;
}

/** Schedule and marking scheme can change only while marks are still being entered. */
export async function updatePaper(id: string, input: UpdatePaperInput, actor: ActorMeta) {
  const paper = await ExamPaper.findOne({ _id: id, deletedAt: null });
  if (!paper) throw AppError.notFound('Paper not found');
  if (paper.status !== 'OPEN') throw AppError.conflict('Return this paper to marks entry before changing it');
  const exam = await Exam.findById(paper.examId).lean();
  const maxMarks = input.maxMarks ?? paper.maxMarks;
  const passMarks = input.passMarks ?? paper.passMarks;
  if (passMarks > maxMarks) throw AppError.badRequest('Pass marks exceed max marks', { field: 'passMarks' });
  if (input.maxMarks !== undefined && input.maxMarks < paper.maxMarks) {
    const over = await Mark.countDocuments({ examPaperId: paper._id, deletedAt: null, marksObtained: { $gt: input.maxMarks } });
    if (over > 0) throw AppError.conflict(`${over} student${over === 1 ? ' has' : 's have'} more than ${input.maxMarks} already`, { field: 'maxMarks' });
  }
  if (input.date && exam && (calendarDay(input.date) < exam.startDate || calendarDay(input.date) > exam.endDate)) {
    throw AppError.badRequest('The paper date must fall within the exam dates', { field: 'date' });
  }
  const before = paper.toObject();
  paper.set({
    ...input,
    date: input.date === undefined ? paper.date : input.date ? calendarDay(input.date) : null,
    startTime: input.startTime === null ? undefined : (input.startTime ?? paper.startTime),
    durationMinutes: input.durationMinutes === null ? undefined : (input.durationMinutes ?? paper.durationMinutes),
  });
  await paper.save();
  await audit(actor, 'exam.paper.update', 'ExamPaper', paper._id, before, paper.toObject());
  return getPaper(id);
}

export async function deletePaper(id: string, actor: ActorMeta) {
  const paper = await ExamPaper.findOne({ _id: id, deletedAt: null });
  if (!paper) throw AppError.notFound('Paper not found');
  if (paper.status !== 'OPEN') throw AppError.conflict('Only a paper still open for marks entry can be removed');
  const marked = await Mark.countDocuments({ examPaperId: paper._id, deletedAt: null, $or: [{ marksObtained: { $ne: null } }, { isAbsent: true }] });
  if (marked > 0) throw AppError.conflict(`${marked} marks have been entered on this paper — it can't be removed`);
  const before = paper.toObject();
  paper.deletedAt = new Date();
  await paper.save();
  await audit(actor, 'exam.paper.delete', 'ExamPaper', paper._id, before, paper.toObject());
}
