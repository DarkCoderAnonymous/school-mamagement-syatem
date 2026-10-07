import { Types } from 'mongoose';
import { Exam } from '../../models/Exam';
import { ExamPaper } from '../../models/ExamPaper';
import { Mark } from '../../models/Mark';
import { ExamResult, type ExamResultDoc, type SubjectResult } from '../../models/ExamResult';
import { Student } from '../../models/Student';
import { Class } from '../../models/Class';
import { School } from '../../models/School';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { withTransaction } from '../../utils/transaction';
import { enqueueMail } from '../../jobs/mailer.queue';
import { TenantContext } from '../../tenant/context';
import { getExamSettings, gradeFor, percent } from './exams.service';

/** Standard competition ranking ("1, 2, 2, 4") by percentage, highest first. */
function rank<T extends { percentage: number }>(rows: T[]): Map<T, number> {
  const sorted = [...rows].sort((a, b) => b.percentage - a.percentage);
  const out = new Map<T, number>();
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    out.set(r, prev && prev.percentage === r.percentage ? out.get(prev)! : i + 1);
  });
  return out;
}

// ─── Publish & withdraw ──────────────────────────────────────────────────────

/**
 * Publishes the results of one or more classes: every paper of each class
 * must be VERIFIED. In ONE transaction, each student's marks are graded,
 * totalled and ranked into an ExamResult snapshot and the papers are locked
 * (PUBLISHED). After commit, each family's primary guardian is emailed.
 */
export async function publishResults(examId: string, classIds: string[], actor: ActorMeta) {
  const exam = await Exam.findOne({ _id: examId, deletedAt: null }).lean();
  if (!exam) throw AppError.notFound('Exam not found');
  const settings = await getExamSettings();

  const papers = await ExamPaper.find({ examId: exam._id, classId: { $in: classIds }, deletedAt: null })
    .populate({ path: 'subjectId', select: 'name code' })
    .lean();
  const classes = await Class.find({ _id: { $in: classIds }, deletedAt: null }).select('name').lean();
  if (classes.length !== new Set(classIds).size) throw AppError.badRequest('One or more classes were not found', { field: 'classIds' });

  for (const cls of classes) {
    const own = papers.filter((p) => String(p.classId) === String(cls._id));
    if (own.length === 0) throw AppError.badRequest(`${cls.name} has no papers in this exam`, { field: 'classIds' });
    if (own.some((p) => p.status === 'PUBLISHED')) throw AppError.conflict(`${cls.name}'s results are already published`);
    const pending = own.filter((p) => p.status !== 'VERIFIED');
    if (pending.length) {
      const names = pending.map((p) => (p.subjectId as unknown as { name: string })?.name).join(', ');
      throw AppError.badRequest(`${cls.name}: ${names} ${pending.length === 1 ? 'is' : 'are'} not verified yet`, { field: 'classIds' });
    }
  }

  const publishedAt = new Date();
  const summary = await withTransaction(async (session) => {
    const out: { classId: string; className: string; students: number; passed: number }[] = [];
    for (const cls of classes) {
      const own = papers.filter((p) => String(p.classId) === String(cls._id));
      const students = await Student.find({ classId: cls._id, status: 'ACTIVE', deletedAt: null })
        .select('firstName lastName admissionNumber rollNumber sectionId')
        .populate({ path: 'sectionId', select: 'name' })
        .session(session)
        .lean();
      const marks = await Mark.find({ examPaperId: { $in: own.map((p) => p._id) }, deletedAt: null }).session(session).lean();
      const markOf = new Map(marks.map((m) => [`${m.examPaperId}:${m.studentId}`, m]));

      const rows = students.map((s) => {
        const subjects: SubjectResult[] = own.map((p) => {
          const subject = p.subjectId as unknown as { _id: Types.ObjectId; name: string; code?: string };
          const m = markOf.get(`${p._id}:${s._id}`);
          // No mark at publish time (a student admitted after submission) counts as absent.
          const isAbsent = m ? m.isAbsent || m.marksObtained === null : true;
          const obtained = isAbsent ? null : m!.marksObtained;
          const pct = percent(obtained ?? 0, p.maxMarks);
          return {
            examPaperId: p._id,
            subjectId: subject?._id,
            name: subject?.name ?? 'Subject',
            code: subject?.code,
            maxMarks: p.maxMarks,
            passMarks: p.passMarks,
            marksObtained: obtained,
            isAbsent,
            percentage: pct,
            grade: isAbsent ? 'AB' : gradeFor(pct, settings.gradingBands).grade,
            passed: !isAbsent && (obtained ?? 0) >= p.passMarks,
            remarks: m?.remarks || undefined,
          };
        });
        const totalObtained = subjects.reduce((sum, x) => sum + (x.marksObtained ?? 0), 0);
        const totalMax = subjects.reduce((sum, x) => sum + x.maxMarks, 0);
        const pct = percent(totalObtained, totalMax);
        const band = gradeFor(pct, settings.gradingBands);
        const section = s.sectionId as unknown as { _id: Types.ObjectId; name: string } | null;
        return {
          schoolId: actor.schoolId,
          examId: exam._id,
          studentId: s._id,
          classId: cls._id,
          sectionId: section?._id ?? null,
          student: { name: `${s.firstName} ${s.lastName}`, admissionNumber: s.admissionNumber, rollNumber: s.rollNumber },
          examName: exam.name,
          className: cls.name,
          sectionName: section?.name,
          subjects,
          totalObtained,
          totalMax,
          percentage: pct,
          grade: band.grade,
          remark: band.remark,
          result: subjects.every((x) => x.passed) ? ('PASS' as const) : ('FAIL' as const),
          classRank: null as number | null,
          sectionRank: null as number | null,
          classSize: students.length,
          gradingBands: settings.gradingBands,
          publishedAt,
          publishedByUserId: actor.actorUserId,
        };
      });

      const classRanks = rank(rows);
      for (const r of rows) r.classRank = classRanks.get(r)!;
      const bySection = new Map<string, typeof rows>();
      for (const r of rows) bySection.set(String(r.sectionId), [...(bySection.get(String(r.sectionId)) ?? []), r]);
      for (const group of bySection.values()) {
        const ranks = rank(group);
        for (const r of group) r.sectionRank = ranks.get(r)!;
      }

      if (rows.length) await ExamResult.insertMany(rows, { session });
      await ExamPaper.updateMany(
        { _id: { $in: own.map((p) => p._id) }, status: 'VERIFIED' },
        { $set: { status: 'PUBLISHED', publishedAt } },
        { session },
      );
      const passed = rows.filter((r) => r.result === 'PASS').length;
      await recordAudit({
        schoolId: actor.schoolId,
        actorUserId: actor.actorUserId,
        action: 'exam.results.publish',
        entity: 'Exam',
        entityId: exam._id,
        before: { classId: cls._id, status: 'VERIFIED' },
        after: { classId: cls._id, status: 'PUBLISHED', students: rows.length, passed },
        ip: actor.ip,
        session,
      });
      out.push({ classId: String(cls._id), className: cls.name, students: rows.length, passed });
    }
    return out;
  }).catch((err) => {
    if ((err as { code?: number }).code === 11000) throw AppError.conflict('These results were published meanwhile — reload');
    throw err;
  });

  const notified = await notifyFamilies(exam._id, classIds, exam.name);
  return { classes: summary, notified };
}

/** After commit, best effort: each primary guardian with an email hears their child's result is out. */
async function notifyFamilies(examId: Types.ObjectId, classIds: string[], examName: string): Promise<number> {
  const schoolId = TenantContext.getSchoolId();
  const school = schoolId ? await School.findById(schoolId).select('name').lean() : null;
  const results = await ExamResult.find({ examId, classId: { $in: classIds }, deletedAt: null }).select('studentId student percentage grade').lean();
  const students = await Student.find({ _id: { $in: results.map((r) => r.studentId) } })
    .select('guardians firstName')
    .populate({ path: 'guardians.guardianId', select: 'firstName email' })
    .lean();
  let sent = 0;
  for (const r of results) {
    const s = students.find((x) => String(x._id) === String(r.studentId));
    const link = s?.guardians.find((g) => g.isPrimary) ?? s?.guardians[0];
    const guardian = link?.guardianId as unknown as { firstName: string; email?: string } | null;
    if (!guardian?.email) continue;
    await enqueueMail({
      to: guardian.email,
      subject: `${examName} results — ${r.student.name}`,
      body: `Dear ${guardian.firstName}, ${s!.firstName}'s ${examName} results are out: ${r.percentage}% (grade ${r.grade}). ` +
        `Contact ${school?.name ?? 'the school'} for the report card.`,
    });
    sent += 1;
  }
  return sent;
}

/**
 * Takes a class's results back down to fix a mistake: results are
 * soft-deleted (kept for the audit trail) and the papers return to VERIFIED,
 * from where a paper can be returned to its teacher.
 */
export async function withdrawResults(examId: string, classId: string, reason: string, actor: ActorMeta) {
  const exam = await Exam.findOne({ _id: examId, deletedAt: null }).lean();
  if (!exam) throw AppError.notFound('Exam not found');
  const published = await ExamPaper.countDocuments({ examId: exam._id, classId, status: 'PUBLISHED', deletedAt: null });
  if (published === 0) throw AppError.conflict("This class's results aren't published");

  await withTransaction(async (session) => {
    const now = new Date();
    const res = await ExamResult.updateMany({ examId: exam._id, classId, deletedAt: null }, { $set: { deletedAt: now } }, { session });
    await ExamPaper.updateMany({ examId: exam._id, classId, status: 'PUBLISHED', deletedAt: null }, { $set: { status: 'VERIFIED', publishedAt: null } }, { session });
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'exam.results.withdraw',
      entity: 'Exam',
      entityId: exam._id,
      before: { classId, status: 'PUBLISHED', results: res.modifiedCount },
      after: { classId, status: 'VERIFIED', reason },
      ip: actor.ip,
      session,
    });
  });
  return { withdrawn: true };
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export async function listResults(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  for (const key of ['examId', 'classId', 'sectionId', 'studentId', 'result'] as const) {
    if (typeof query[key] === 'string') filter[key] = query[key];
  }
  // The type lives on the exam, not the result snapshot — it's a classification, not something the card prints.
  if (Array.isArray(query.examType)) {
    const examIds = await Exam.find({ type: { $in: query.examType }, deletedAt: null }).distinct('_id');
    filter.examId = typeof filter.examId === 'string' ? { $in: examIds, $eq: filter.examId } : { $in: examIds };
  }
  if (search) filter.$or = [{ 'student.name': searchRegex(search) }, { 'student.admissionNumber': searchRegex(search) }];
  const sort = listSort(query, ['classRank', 'percentage', 'publishedAt'], { classRank: 1 });
  const [items, total] = await Promise.all([
    ExamResult.find(filter).sort({ ...sort, 'student.name': 1, _id: 1 }).skip(skip).limit(limit).lean(),
    ExamResult.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

/** A report card: the result snapshot plus what the printout needs around it. */
export async function getResult(id: string) {
  const result = await ExamResult.findOne({ _id: id, deletedAt: null }).lean();
  if (!result) throw AppError.notFound('Result not found');
  const [exam, school, settings, student] = await Promise.all([
    Exam.findById(result.examId).select('name type startDate endDate').populate({ path: 'academicSessionId', select: 'name' }).lean(),
    School.findById(TenantContext.getSchoolId()).select('name address logoUrl').lean(),
    getExamSettings(),
    Student.findById(result.studentId)
      .select('dateOfBirth guardians')
      .populate({ path: 'guardians.guardianId', select: 'firstName lastName phone' })
      .lean(),
  ]);
  const primary = student?.guardians.find((g) => g.isPrimary) ?? student?.guardians[0];
  return {
    ...result,
    exam,
    school: { name: school?.name ?? 'School', address: school?.address, logoUrl: school?.logoUrl ?? null },
    guardian: primary?.guardianId ?? null,
    dateOfBirth: student?.dateOfBirth ?? null,
    // The scale the grades were given with, not today's — older results predate the snapshot.
    gradingBands: result.gradingBands?.length ? result.gradingBands : settings.gradingBands,
    showPositions: settings.showPositions,
  };
}

/**
 * Result analysis for an exam — over all published classes, or one:
 * headline pass rate and average, subject-wise averages and pass rates,
 * grade distribution, per-class comparison and the toppers.
 */
export async function analysis(examId: string, classId?: string) {
  const exam = await Exam.findOne({ _id: examId, deletedAt: null }).select('name').lean();
  if (!exam) throw AppError.notFound('Exam not found');
  const match: Record<string, unknown> = { examId: exam._id, deletedAt: null };
  if (classId) match.classId = new Types.ObjectId(classId);

  const [overall, subjects, grades, classes, toppers] = await Promise.all([
    ExamResult.aggregate<{ students: number; passed: number; average: number; highest: number; lowest: number }>([
      { $match: match },
      {
        $group: {
          _id: null,
          students: { $sum: 1 },
          passed: { $sum: { $cond: [{ $eq: ['$result', 'PASS'] }, 1, 0] } },
          average: { $avg: '$percentage' },
          highest: { $max: '$percentage' },
          lowest: { $min: '$percentage' },
        },
      },
    ]),
    ExamResult.aggregate<{ _id: string; students: number; passed: number; absent: number; averagePercent: number; highest: number }>([
      { $match: match },
      { $unwind: '$subjects' },
      {
        $group: {
          _id: '$subjects.name',
          students: { $sum: 1 },
          passed: { $sum: { $cond: ['$subjects.passed', 1, 0] } },
          absent: { $sum: { $cond: ['$subjects.isAbsent', 1, 0] } },
          averagePercent: { $avg: '$subjects.percentage' },
          highest: { $max: '$subjects.percentage' },
        },
      },
      { $sort: { averagePercent: -1 } },
    ]),
    ExamResult.aggregate<{ _id: string; n: number }>([{ $match: match }, { $group: { _id: '$grade', n: { $sum: 1 } } }]),
    ExamResult.aggregate<{ _id: { classId: Types.ObjectId; name: string }; students: number; passed: number; average: number }>([
      { $match: match },
      {
        $group: {
          _id: { classId: '$classId', name: '$className' },
          students: { $sum: 1 },
          passed: { $sum: { $cond: [{ $eq: ['$result', 'PASS'] }, 1, 0] } },
          average: { $avg: '$percentage' },
        },
      },
      { $sort: { '_id.name': 1 } },
    ]),
    ExamResult.find(match).sort({ percentage: -1, 'student.name': 1 }).limit(5).select('studentId student className sectionName percentage grade classRank').lean(),
  ]);

  const settings = await getExamSettings();
  const o = overall[0];
  const round = (n: number | undefined) => Math.round((n ?? 0) * 100) / 100;
  return {
    examName: exam.name,
    students: o?.students ?? 0,
    passed: o?.passed ?? 0,
    passPercent: o?.students ? round((o.passed / o.students) * 100) : 0,
    averagePercent: round(o?.average),
    highestPercent: round(o?.highest),
    lowestPercent: round(o?.lowest),
    subjects: subjects.map((s) => ({
      name: s._id,
      students: s.students,
      passed: s.passed,
      absent: s.absent,
      passPercent: round((s.passed / s.students) * 100),
      averagePercent: round(s.averagePercent),
      highestPercent: round(s.highest),
    })),
    // In scale order, including grades nobody got, plus AB never appears overall.
    grades: settings.gradingBands.map((b) => ({ grade: b.grade, count: grades.find((g) => g._id === b.grade)?.n ?? 0 })),
    classes: classes.map((c) => ({
      classId: String(c._id.classId),
      className: c._id.name,
      students: c.students,
      passPercent: round((c.passed / c.students) * 100),
      averagePercent: round(c.average),
    })),
    toppers: toppers as Pick<ExamResultDoc, '_id' | 'studentId' | 'student' | 'className' | 'sectionName' | 'percentage' | 'grade' | 'classRank'>[],
  };
}
