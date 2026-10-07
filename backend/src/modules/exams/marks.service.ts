import { Types, type ClientSession } from 'mongoose';
import { Exam } from '../../models/Exam';
import { ExamPaper, type ExamPaperDoc } from '../../models/ExamPaper';
import { Mark, type MarkDoc } from '../../models/Mark';
import { Class } from '../../models/Class';
import { Student } from '../../models/Student';
import { Section } from '../../models/Section';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { buildPaginationMeta } from '../../utils/response';
import { withTransaction } from '../../utils/transaction';
import { assignedClassSubjects, classSubjectKey } from '../../services/teaching-scope.service';
import { getPaper, percent } from './exams.service';
import type { SaveMarksInput, SaveStudentMarksInput } from './exams.validation';

/**
 * Who may enter marks on which paper. Holding `exam.marks.enter` lets you
 * into marks entry at all; a teacher is then limited to the class + subject
 * pairs they hold a teaching assignment for (a Maths teacher of Grade 5 can't
 * reach Grade 10's Maths paper), while the exam office (anyone who can also
 * verify and publish) may enter any paper. Passed in by the controller from
 * the token's permissions — services never see the request.
 */
export interface MarksViewer {
  userId: string;
  canEnterAny: boolean;
}

/** The class + subject pairs this viewer may enter, or null for the exam office (everything). */
function enterableFor(viewer: MarksViewer): Promise<Set<string> | null> {
  return viewer.canEnterAny ? Promise.resolve(null) : assignedClassSubjects(viewer.userId);
}

async function mayEnter(paper: Pick<ExamPaperDoc, 'classId' | 'subjectId'>, viewer: MarksViewer): Promise<boolean> {
  const allowed = await enterableFor(viewer);
  return allowed === null || allowed.has(classSubjectKey(paper.classId, paper.subjectId));
}

const NOT_ASSIGNED = 'You can only enter marks for classes and subjects assigned to you — ask the school office to assign this one';

async function assertMayEnter(paper: Pick<ExamPaperDoc, 'classId' | 'subjectId'>, viewer: MarksViewer) {
  if (!(await mayEnter(paper, viewer))) throw AppError.forbidden(NOT_ASSIGNED);
}

const hasMark = { $or: [{ marksObtained: { $ne: null } }, { isAbsent: true }] };

/** Entered-vs-roster counts for a set of papers. */
async function progressFor(papers: Pick<ExamPaperDoc, '_id' | 'classId'>[]) {
  const [entered, strength] = await Promise.all([
    Mark.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { examPaperId: { $in: papers.map((p) => p._id) }, deletedAt: null, ...hasMark } },
      { $group: { _id: '$examPaperId', n: { $sum: 1 } } },
    ]),
    Student.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { classId: { $in: papers.map((p) => p.classId) }, status: 'ACTIVE', deletedAt: null } },
      { $group: { _id: '$classId', n: { $sum: 1 } } },
    ]),
  ]);
  return {
    entered: new Map(entered.map((e) => [String(e._id), e.n])),
    strength: new Map(strength.map((s) => [String(s._id), s.n])),
  };
}

// ─── Queues ──────────────────────────────────────────────────────────────────

/** Papers across exams — the marks-entry queue (`mine`) and the verification queue (`status=SUBMITTED`). */
export async function listPapers(query: Record<string, unknown>, viewer: MarksViewer) {
  const { page, limit, skip } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  for (const key of ['examId', 'classId', 'subjectId', 'status'] as const) {
    if (typeof query[key] === 'string') filter[key] = query[key];
  }
  if (query.mine) {
    // Any explicit classId/subjectId above still narrows this further.
    const pairs = [...(await assignedClassSubjects(viewer.userId))].map((key) => {
      const [classId, subjectId] = key.split(':');
      return { classId, subjectId };
    });
    filter.$or = pairs.length ? pairs : [{ _id: { $in: [] } }];
  }
  const [items, total] = await Promise.all([
    ExamPaper.find(filter)
      // Newest first: this week's papers lead the queue, last term's published ones trail.
      .sort({ date: -1, createdAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .populate([
        { path: 'examId', select: 'name type' },
        { path: 'classId', select: 'name order' },
        { path: 'subjectId', select: 'name code' },
      ])
      .lean(),
    ExamPaper.countDocuments(filter),
  ]);
  const raw = items.map((p) => ({ _id: p._id, classId: (p.classId as unknown as { _id: Types.ObjectId })._id }));
  const { entered, strength } = await progressFor(raw);
  return {
    items: items.map((p, i) => ({
      ...p,
      marksEntered: entered.get(String(p._id)) ?? 0,
      classStrength: strength.get(String(raw[i]!.classId)) ?? 0,
    })),
    meta: buildPaginationMeta(page, limit, total),
  };
}

// ─── The marks sheet ─────────────────────────────────────────────────────────

const byRoll = (a: { rollNumber?: string; firstName: string }, b: { rollNumber?: string; firstName: string }) =>
  (a.rollNumber ?? '').localeCompare(b.rollNumber ?? '', undefined, { numeric: true }) || a.firstName.localeCompare(b.firstName);

/** One paper's roster with each student's mark, optionally for one section. */
export async function getPaperSheet(id: string, sectionId: string | undefined, viewer: MarksViewer) {
  const paper = await getPaper(id);
  const classId = (paper.classId as unknown as { _id: Types.ObjectId })._id;
  const subjectId = (paper.subjectId as unknown as { _id: Types.ObjectId })._id;
  const [sections, students, marks] = await Promise.all([
    Section.find({ classId, deletedAt: null }).sort({ name: 1 }).select('name').lean(),
    Student.find({ classId, status: 'ACTIVE', deletedAt: null, ...(sectionId ? { sectionId } : {}) })
      .select('firstName lastName admissionNumber rollNumber sectionId')
      .lean(),
    Mark.find({ examPaperId: paper._id, deletedAt: null }).lean(),
  ]);
  const byStudent = new Map(marks.map((m) => [String(m.studentId), m]));
  const classTotal = sectionId ? await Student.countDocuments({ classId, status: 'ACTIVE', deletedAt: null }) : students.length;

  return {
    paper,
    sections,
    canEdit: paper.status === 'OPEN' && (await mayEnter({ classId, subjectId }, viewer)),
    enteredCount: marks.filter((m) => m.marksObtained !== null || m.isAbsent).length,
    classStrength: classTotal,
    rows: students.sort(byRoll).map((s) => {
      const m = byStudent.get(String(s._id));
      return {
        student: s,
        marksObtained: m?.marksObtained ?? null,
        isAbsent: m?.isAbsent ?? false,
        remarks: m?.remarks ?? '',
        updatedAt: m?.updatedAt ?? null,
      };
    }),
  };
}

/**
 * Upserts one student's mark on one paper inside the caller's transaction,
 * skipping it when nothing changed. Returns the audit before/after, or null.
 */
async function writeMark(
  session: ClientSession,
  paper: Pick<ExamPaperDoc, '_id' | 'examId'>,
  studentId: string,
  sectionId: Types.ObjectId | null,
  entry: { marksObtained: number | null; isAbsent: boolean; remarks?: string },
  prev: Pick<MarkDoc, 'marksObtained' | 'isAbsent' | 'remarks'> | undefined,
  actor: ActorMeta,
): Promise<{ before: unknown; after: unknown } | null> {
  const next = { marksObtained: entry.isAbsent ? null : entry.marksObtained, isAbsent: entry.isAbsent, remarks: entry.remarks ?? '' };
  if (prev && prev.marksObtained === next.marksObtained && prev.isAbsent === next.isAbsent && (prev.remarks ?? '') === next.remarks) return null;
  await Mark.updateOne(
    { examPaperId: paper._id, studentId, deletedAt: null },
    {
      $set: { ...next, enteredByUserId: actor.actorUserId },
      $setOnInsert: { examId: paper.examId, sectionId },
    },
    { upsert: true, session },
  );
  return {
    before: prev ? { marksObtained: prev.marksObtained, isAbsent: prev.isAbsent } : null,
    after: { marksObtained: next.marksObtained, isAbsent: next.isAbsent },
  };
}

/**
 * Saves some or all of a paper's marks — the grid autosaves the rows that
 * changed. All-or-nothing, and only while the paper is OPEN: the status is
 * re-read inside the transaction, so a paper submitted in another tab can't
 * take a late write.
 */
export async function saveMarks(id: string, input: SaveMarksInput, actor: ActorMeta, viewer: MarksViewer) {
  const paper = await ExamPaper.findOne({ _id: id, deletedAt: null }).lean();
  if (!paper) throw AppError.notFound('Paper not found');
  await assertMayEnter(paper, viewer);
  if (paper.status !== 'OPEN') throw AppError.conflict('This paper has been submitted — ask the exam office to return it for changes');

  for (const e of input.entries) {
    if (e.marksObtained !== null && e.marksObtained > paper.maxMarks) {
      throw AppError.badRequest(`Marks can't exceed ${paper.maxMarks}`, { field: 'entries', studentId: e.studentId });
    }
  }
  const students = await Student.find({ _id: { $in: input.entries.map((e) => e.studentId) }, classId: paper.classId, status: 'ACTIVE', deletedAt: null })
    .select('sectionId')
    .lean();
  if (students.length !== input.entries.length) {
    throw AppError.badRequest("One or more students aren't in this class", { field: 'entries' });
  }
  const sectionOf = new Map(students.map((s) => [String(s._id), s.sectionId]));

  const changes = await withTransaction(async (session) => {
    const live = await ExamPaper.findOne({ _id: paper._id, status: 'OPEN', deletedAt: null }).session(session).select('_id').lean();
    if (!live) throw AppError.conflict('This paper was submitted meanwhile — reload');
    const existing = await Mark.find({ examPaperId: paper._id, studentId: { $in: input.entries.map((e) => e.studentId) }, deletedAt: null })
      .session(session)
      .lean();
    const before = new Map(existing.map((m) => [String(m.studentId), m]));
    const changed: { studentId: string; before: unknown; after: unknown }[] = [];

    for (const e of input.entries) {
      const change = await writeMark(session, paper, e.studentId, sectionOf.get(e.studentId) ?? null, e, before.get(e.studentId), actor);
      if (change) changed.push({ studentId: e.studentId, ...change });
    }
    if (changed.length) {
      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'exam.marks.enter',
        entity: 'ExamPaper',
        entityId: paper._id,
        before: changed.map((c) => ({ studentId: c.studentId, ...(c.before as object) })),
        after: changed.map((c) => ({ studentId: c.studentId, ...(c.after as object) })),
        ip: actor.ip,
        session,
      });
    }
    return changed.length;
  });

  const entered = await Mark.countDocuments({ examPaperId: paper._id, deletedAt: null, ...hasMark });
  return { saved: changes, enteredCount: entered, savedAt: new Date() };
}

// ─── Student-wise entry (class board → class sheet → one student) ────────────

type PopulatedPaper = Omit<ExamPaperDoc, 'subjectId'> & { subjectId: { _id: Types.ObjectId; name: string; code?: string } };

/** The exam and a class in its session — both must exist in this school. */
async function examAndClass(examId: string, classId: string) {
  const exam = await Exam.findOne({ _id: examId, deletedAt: null }).select('name type startDate endDate academicSessionId').lean();
  if (!exam) throw AppError.notFound('Exam not found');
  const cls = await Class.findOne({ _id: classId, academicSessionId: exam.academicSessionId, deletedAt: null }).select('name order').lean();
  if (!cls) throw AppError.notFound("Class not found in this exam's session");
  return { exam, cls };
}

const byDateThenName = (a: PopulatedPaper, b: PopulatedPaper) =>
  (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity) || a.subjectId.name.localeCompare(b.subjectId.name);

/**
 * Every class in the exam's session as a card: its sections, strength,
 * how many papers it sits and how many of the marks are in. Classes with
 * no papers are included, so the date sheet can be started from here.
 */
export async function getBoard(examId: string, viewer: MarksViewer) {
  const exam = await Exam.findOne({ _id: examId, deletedAt: null }).select('name type startDate endDate academicSessionId').lean();
  if (!exam) throw AppError.notFound('Exam not found');
  const [classes, papers, taught] = await Promise.all([
    Class.find({ academicSessionId: exam.academicSessionId, deletedAt: null }).sort({ order: 1, name: 1 }).select('name order').lean(),
    ExamPaper.find({ examId: exam._id, deletedAt: null }).select('classId subjectId maxMarks status').lean(),
    enterableFor(viewer),
  ]);
  const classIds = classes.map((c) => c._id);
  const [sections, strength, entered] = await Promise.all([
    Section.find({ classId: { $in: classIds }, deletedAt: null }).sort({ name: 1 }).select('classId name').lean(),
    Student.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { classId: { $in: classIds }, status: 'ACTIVE', deletedAt: null } },
      { $group: { _id: '$classId', n: { $sum: 1 } } },
    ]),
    Mark.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { examId: exam._id, deletedAt: null, ...hasMark } },
      { $group: { _id: '$examPaperId', n: { $sum: 1 } } },
    ]),
  ]);
  const strengthBy = new Map(strength.map((s) => [String(s._id), s.n]));
  const enteredBy = new Map(entered.map((e) => [String(e._id), e.n]));

  return {
    exam: { _id: exam._id, name: exam.name, type: exam.type, startDate: exam.startDate, endDate: exam.endDate },
    classes: classes.map((c) => {
      const own = papers.filter((p) => String(p.classId) === String(c._id));
      const students = strengthBy.get(String(c._id)) ?? 0;
      const statusCounts: Partial<Record<ExamPaperDoc['status'], number>> = {};
      for (const p of own) statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
      return {
        _id: c._id,
        name: c.name,
        order: c.order,
        sections: sections.filter((s) => String(s.classId) === String(c._id)).map((s) => ({ _id: s._id, name: s.name })),
        students,
        papers: own.length,
        totalMax: own.reduce((sum, p) => sum + p.maxMarks, 0),
        marksEntered: own.reduce((sum, p) => sum + Math.min(enteredBy.get(String(p._id)) ?? 0, students), 0),
        marksExpected: own.length * students,
        statusCounts,
        /** Papers this viewer may enter (all of them for the exam office). */
        yourPapers: taught ? own.filter((p) => taught.has(classSubjectKey(p.classId, p.subjectId))).length : own.length,
      };
    }),
  };
}

/**
 * One class's award list for an exam: every paper as a column and every
 * student (optionally one section) as a row with their marks and totals —
 * "Total" is the sum of the papers' max marks, "Obtained" what they scored
 * (absent counts as zero obtained, full max). Each paper says whether this
 * viewer may enter it.
 */
export async function getClassSheet(examId: string, classId: string, sectionId: string | undefined, viewer: MarksViewer) {
  const { exam, cls } = await examAndClass(examId, classId);
  const [sections, papersRaw, students, taught] = await Promise.all([
    Section.find({ classId: cls._id, deletedAt: null }).sort({ name: 1 }).select('name').lean(),
    ExamPaper.find({ examId: exam._id, classId: cls._id, deletedAt: null }).populate({ path: 'subjectId', select: 'name code' }).lean(),
    Student.find({ classId: cls._id, status: 'ACTIVE', deletedAt: null, ...(sectionId ? { sectionId } : {}) })
      .select('firstName lastName admissionNumber rollNumber sectionId')
      .lean(),
    enterableFor(viewer),
  ]);
  const papers = (papersRaw as unknown as PopulatedPaper[]).sort(byDateThenName);
  const marks = await Mark.find({ examPaperId: { $in: papers.map((p) => p._id) }, studentId: { $in: students.map((s) => s._id) }, deletedAt: null })
    .select('examPaperId studentId marksObtained isAbsent remarks')
    .lean();
  const markOf = new Map(marks.map((m) => [`${m.studentId}:${m.examPaperId}`, m]));
  const totalMax = papers.reduce((sum, p) => sum + p.maxMarks, 0);
  // Roll numbers restart in each section, so the whole class reads section by section.
  const sectionName = new Map(sections.map((s) => [String(s._id), s.name]));
  const bySectionThenRoll = (a: (typeof students)[number], b: (typeof students)[number]) =>
    (sectionName.get(String(a.sectionId)) ?? '').localeCompare(sectionName.get(String(b.sectionId)) ?? '') || byRoll(a, b);

  return {
    exam: { _id: exam._id, name: exam.name, type: exam.type, startDate: exam.startDate, endDate: exam.endDate },
    class: { _id: cls._id, name: cls.name },
    sections,
    papers: papers.map((p) => ({
      _id: p._id,
      subject: p.subjectId,
      date: p.date,
      startTime: p.startTime,
      maxMarks: p.maxMarks,
      passMarks: p.passMarks,
      status: p.status,
      canEdit: p.status === 'OPEN' && (taught === null || taught.has(classSubjectKey(cls._id, p.subjectId._id))),
    })),
    totalMax,
    rows: students.sort(bySectionThenRoll).map((s) => {
      let obtained = 0;
      let entered = 0;
      const byPaper: Record<string, { marksObtained: number | null; isAbsent: boolean; remarks: string }> = {};
      for (const p of papers) {
        const m = markOf.get(`${s._id}:${p._id}`);
        if (!m) continue;
        byPaper[String(p._id)] = { marksObtained: m.marksObtained, isAbsent: m.isAbsent, remarks: m.remarks ?? '' };
        if (m.marksObtained !== null || m.isAbsent) entered += 1;
        obtained += m.marksObtained ?? 0;
      }
      return { student: s, marks: byPaper, entered, totalObtained: obtained, totalMax, percentage: totalMax > 0 ? percent(obtained, totalMax) : 0 };
    }),
  };
}

/**
 * Saves one student's marks across the papers of their class — the
 * student-wise panel. Every paper must be on the student's class's date
 * sheet, open, and one this viewer may enter; the statuses are re-read
 * inside the transaction so a paper submitted meanwhile can't take a write.
 */
export async function saveStudentMarks(examId: string, studentId: string, input: SaveStudentMarksInput, actor: ActorMeta, viewer: MarksViewer) {
  const student = await Student.findOne({ _id: studentId, status: 'ACTIVE', deletedAt: null }).select('classId sectionId').lean();
  if (!student) throw AppError.notFound('Student not found');
  const paperIds = input.entries.map((e) => e.examPaperId);
  const papers = (await ExamPaper.find({ _id: { $in: paperIds }, examId, classId: student.classId, deletedAt: null })
    .populate({ path: 'subjectId', select: 'name' })
    .lean()) as unknown as PopulatedPaper[];
  if (papers.length !== paperIds.length) throw AppError.badRequest("One or more papers aren't on this student's date sheet", { field: 'entries' });
  const paperOf = new Map(papers.map((p) => [String(p._id), p]));
  const taught = await enterableFor(viewer);

  for (const e of input.entries) {
    const p = paperOf.get(e.examPaperId)!;
    const name = p.subjectId.name;
    if (taught && !taught.has(classSubjectKey(student.classId, p.subjectId._id))) {
      throw AppError.forbidden(`You can only enter marks for classes and subjects assigned to you — ${name} in this class isn't one of them`);
    }
    if (p.status !== 'OPEN') throw AppError.conflict(`${name} has been submitted — ask the exam office to return it for changes`, { examPaperId: e.examPaperId });
    if (e.marksObtained !== null && e.marksObtained > p.maxMarks) {
      throw AppError.badRequest(`${name}: marks can't exceed ${p.maxMarks}`, { field: 'entries', examPaperId: e.examPaperId });
    }
  }

  const changes = await withTransaction(async (session) => {
    const live = await ExamPaper.countDocuments({ _id: { $in: paperIds }, status: 'OPEN', deletedAt: null }).session(session);
    if (live !== paperIds.length) throw AppError.conflict('A paper was submitted meanwhile — reload');
    const existing = await Mark.find({ examPaperId: { $in: paperIds }, studentId: student._id, deletedAt: null }).session(session).lean();
    const before = new Map(existing.map((m) => [String(m.examPaperId), m]));
    const changed: { examPaperId: string; before: unknown; after: unknown }[] = [];
    for (const e of input.entries) {
      const p = paperOf.get(e.examPaperId)!;
      const change = await writeMark(session, p, String(student._id), student.sectionId ?? null, e, before.get(e.examPaperId), actor);
      if (change) changed.push({ examPaperId: e.examPaperId, ...change });
    }
    if (changed.length) {
      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'exam.marks.enter',
        entity: 'Student',
        entityId: student._id,
        before: { examId, marks: changed.map((c) => ({ examPaperId: c.examPaperId, ...(c.before as object) })) },
        after: { examId, marks: changed.map((c) => ({ examPaperId: c.examPaperId, ...(c.after as object) })) },
        ip: actor.ip,
        session,
      });
    }
    return changed.length;
  });
  return { saved: changes, savedAt: new Date() };
}

// ─── Workflow ────────────────────────────────────────────────────────────────

async function transition(
  id: string,
  from: ExamPaperDoc['status'][],
  set: Record<string, unknown>,
  actor: ActorMeta,
  action: string,
  conflict: string,
  extraAudit: Record<string, unknown> = {},
) {
  const paper = await ExamPaper.findOne({ _id: id, deletedAt: null }).lean();
  if (!paper) throw AppError.notFound('Paper not found');
  const res = await ExamPaper.updateOne({ _id: paper._id, status: { $in: from }, deletedAt: null }, { $set: set });
  if (res.modifiedCount === 0) throw AppError.conflict(conflict);
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action,
    entity: 'ExamPaper',
    entityId: paper._id,
    before: { status: paper.status },
    after: { status: set.status, ...extraAudit },
    ip: actor.ip,
  });
  return getPaper(id);
}

/** The teacher's "done": every student in the class has a mark or is marked absent. */
export async function submitPaper(id: string, actor: ActorMeta, viewer: MarksViewer) {
  const paper = await ExamPaper.findOne({ _id: id, deletedAt: null }).lean();
  if (!paper) throw AppError.notFound('Paper not found');
  await assertMayEnter(paper, viewer);
  const [students, entered] = await Promise.all([
    Student.find({ classId: paper.classId, status: 'ACTIVE', deletedAt: null }).select('_id').lean(),
    Mark.find({ examPaperId: paper._id, deletedAt: null, ...hasMark }).select('studentId').lean(),
  ]);
  const done = new Set(entered.map((m) => String(m.studentId)));
  const missing = students.filter((s) => !done.has(String(s._id))).length;
  if (missing > 0) {
    throw AppError.badRequest(`${missing} student${missing === 1 ? ' has' : 's have'} no mark yet — enter a mark or mark them absent`, { missing });
  }
  return transition(
    id,
    ['OPEN'],
    { status: 'SUBMITTED', submittedAt: new Date(), submittedByUserId: actor.actorUserId, returnReason: undefined },
    actor,
    'exam.paper.submit',
    'This paper is not open for marks entry',
  );
}

export async function verifyPaper(id: string, actor: ActorMeta) {
  return transition(
    id,
    ['SUBMITTED'],
    { status: 'VERIFIED', verifiedAt: new Date(), verifiedByUserId: actor.actorUserId },
    actor,
    'exam.paper.verify',
    'Only a submitted paper can be verified',
  );
}

/** Sends a paper back to marks entry with a note for the teacher. Published papers are withdrawn from the results page instead. */
export async function returnPaper(id: string, reason: string, actor: ActorMeta) {
  return transition(
    id,
    ['SUBMITTED', 'VERIFIED'],
    { status: 'OPEN', returnReason: reason, verifiedAt: null, verifiedByUserId: null },
    actor,
    'exam.paper.return',
    'Only a submitted or verified paper can be returned — withdraw published results first',
    { reason },
  );
}
