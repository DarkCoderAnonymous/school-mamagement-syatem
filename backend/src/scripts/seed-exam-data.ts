import { Class } from '../models/Class';
import { Exam } from '../models/Exam';
import { ExamPaper } from '../models/ExamPaper';
import { Student } from '../models/Student';
import { Subject } from '../models/Subject';
import { AcademicSession } from '../models/AcademicSession';
import type { ActorMeta } from '../utils/actor';
import { addPapers, createExam } from '../modules/exams/exams.service';
import { saveMarks, submitPaper, verifyPaper, type MarksViewer } from '../modules/exams/marks.service';
import { publishResults } from '../modules/exams/results.service';

/**
 * Exams for the demo school, through the real services:
 *  - last month's Mid-term, every class, five subjects — marks entered,
 *    submitted, verified and PUBLISHED, so results, analysis and report cards
 *    have data;
 *  - this month's Unit test (Maths and English) mid-workflow: some papers
 *    submitted and waiting for verification, some half-entered, some not
 *    started — so marks entry and the verification queue aren't empty.
 * Skips itself if the school already has exams. Must run in the school's
 * tenant context (seedSchoolData provides it).
 */

const MIDTERM_SUBJECTS = ['MATH', 'ENG', 'SCI', 'SST', 'CS'];

function monthKey(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
}
const dayOf = (key: string, day: number) => new Date(`${key}-${String(day).padStart(2, '0')}T00:00:00.000Z`);

/** Deterministic 0..1 from a string, so a re-seeded school gets the same marks. */
function unit(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/** A believable mark: each student has an ability, each subject a little noise. */
function markFor(admissionNumber: string, subject: string, max: number): number | 'ABSENT' {
  if (unit(`${admissionNumber}:${subject}:absent`) < 0.03) return 'ABSENT';
  const ability = 0.38 + unit(admissionNumber) * 0.57; // 38%–95%
  const noise = (unit(`${admissionNumber}:${subject}`) - 0.5) * 0.24;
  const pct = Math.min(1, Math.max(0.12, ability + noise));
  const raw = pct * max;
  // Mostly whole marks, the odd half.
  return unit(`${admissionNumber}:${subject}:half`) < 0.15 ? Math.round(raw * 2) / 2 : Math.round(raw);
}

async function enterMarks(paperId: string, subject: string, max: number, students: { _id: unknown; admissionNumber: string }[], actor: ActorMeta, viewer: MarksViewer) {
  const entries = students.map((s) => {
    const m = markFor(s.admissionNumber, subject, max);
    return { studentId: String(s._id), marksObtained: m === 'ABSENT' ? null : m, isAbsent: m === 'ABSENT' };
  });
  for (let i = 0; i < entries.length; i += 100) await saveMarks(paperId, { entries: entries.slice(i, i + 100) }, actor, viewer);
}

export async function seedExamData(actor: ActorMeta): Promise<boolean> {
  if ((await Exam.countDocuments({ deletedAt: null })) > 0) return false;
  const session = await AcademicSession.findOne({ isCurrent: true, deletedAt: null }).select('_id').lean();
  if (!session) return false;
  const classes = await Class.find({ academicSessionId: session._id, deletedAt: null }).sort({ order: 1 }).lean();
  const subjects = await Subject.find({ deletedAt: null }).lean();
  const code = (c: string) => subjects.find((s) => s.code === c);
  if (classes.length === 0 || !code('MATH') || !code('ENG')) return false;
  const viewer: MarksViewer = { userId: actor.actorUserId, canEnterAny: true };
  const classIds = classes.map((c) => String(c._id));
  const studentsOf = async (classId: string) =>
    Student.find({ classId, status: 'ACTIVE', deletedAt: null }).select('admissionNumber').sort({ admissionNumber: 1 }).lean();

  // ── Mid-term: published ──
  const prev = monthKey(-1);
  const midterm = await createExam({ name: 'Mid-term examination', type: 'MIDTERM', startDate: dayOf(prev, 10), endDate: dayOf(prev, 16) }, actor);
  const mids = MIDTERM_SUBJECTS.map((c) => code(c)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  await addPapers(
    String(midterm._id),
    { classIds, subjects: mids.map((s, i) => ({ subjectId: String(s._id), maxMarks: 100, passMarks: 33, date: dayOf(prev, 10 + i), startTime: '09:00' })) },
    actor,
  );
  const midPapers = await ExamPaper.find({ examId: midterm._id, deletedAt: null }).populate({ path: 'subjectId', select: 'code' }).lean();
  for (const cls of classIds) {
    const students = await studentsOf(cls);
    for (const p of midPapers.filter((x) => String(x.classId) === cls)) {
      const subjectCode = (p.subjectId as unknown as { code: string }).code;
      await enterMarks(String(p._id), subjectCode, p.maxMarks, students, actor, viewer);
      await submitPaper(String(p._id), actor, viewer);
      await verifyPaper(String(p._id), actor);
    }
  }
  await publishResults(String(midterm._id), classIds, actor);

  // ── Unit test: in progress ──
  const current = monthKey(0);
  const unitTest = await createExam({ name: 'Unit test 2', type: 'UNIT_TEST', startDate: dayOf(current, 15), endDate: dayOf(current, 18) }, actor);
  await addPapers(
    String(unitTest._id),
    {
      classIds,
      subjects: [
        { subjectId: String(code('MATH')!._id), maxMarks: 25, passMarks: 9, date: dayOf(current, 15) },
        { subjectId: String(code('ENG')!._id), maxMarks: 25, passMarks: 9, date: dayOf(current, 16) },
      ],
    },
    actor,
  );
  const unitPapers = await ExamPaper.find({ examId: unitTest._id, deletedAt: null }).populate({ path: 'subjectId', select: 'code' }).lean();
  for (const [ci, cls] of classIds.entries()) {
    const students = await studentsOf(cls);
    for (const p of unitPapers.filter((x) => String(x.classId) === cls)) {
      const subjectCode = (p.subjectId as unknown as { code: string }).code;
      if (ci < 2) {
        // Grades 1–2: done and waiting for the exam office.
        await enterMarks(String(p._id), `${subjectCode}-ut`, p.maxMarks, students, actor, viewer);
        await submitPaper(String(p._id), actor, viewer);
      } else if (ci < 4 && subjectCode === 'ENG') {
        // Grades 3–4 English: half the class entered.
        await enterMarks(String(p._id), `${subjectCode}-ut`, p.maxMarks, students.slice(0, Math.ceil(students.length / 2)), actor, viewer);
      }
      // The rest (incl. Grades 3–6 Maths, Hannah's subject) are left for the teacher.
    }
  }
  return true;
}
