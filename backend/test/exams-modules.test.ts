import request from 'supertest';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/db/connection';
import { ensureRbacSeeded } from '../src/rbac/seedRbac';
import { User } from '../src/models/User';
import { hashPassword } from '../src/utils/password';
import { redis } from '../src/config/redis';
import { mailerQueue } from '../src/jobs/mailer.queue';
import { asSystem } from './helpers/as-system';
import { buildFixture, type CrossTenantFixture } from './cross-tenant/fixture';

/**
 * Exams, marks and results: the workflow and the grading arithmetic. Tenant
 * isolation for these models and endpoints comes from the cross-tenant
 * registry; this covers behaviour inside a school.
 */
const app = createApp();
let fx: CrossTenantFixture;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const A = () => auth(fx.a.token);
const api = (path: string) => `/api/v1${path}`;

async function signIn(email: string, password: string): Promise<string> {
  await asSystem(async () =>
    User.updateOne({ email }, { $set: { passwordHash: await hashPassword(password), mustChangePassword: false } }),
  );
  const res = await request(app).post(api('/auth/login')).send({ email, password }).expect(200);
  return res.body.data.accessToken as string;
}

let classId: string;
let sectionA: string;
let sectionB: string;
let math: string;
let english: string;
let s1: string;
let s2: string;
let s3: string;
let teacherToken: string;
let examId: string;
let mathPaper: string;
let englishPaper: string;

beforeAll(async () => {
  await connectDB();
  await ensureRbacSeeded();
  fx = await buildFixture(app);

  await request(app)
    .post(api('/academic-sessions'))
    .set(A())
    .send({ name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true })
    .expect(201);
  classId = (await request(app).post(api('/classes')).set(A()).send({ name: 'Grade 7' }).expect(201)).body.data._id;
  sectionA = (await request(app).post(api('/sections')).set(A()).send({ classId, name: 'A' }).expect(201)).body.data._id;
  sectionB = (await request(app).post(api('/sections')).set(A()).send({ classId, name: 'B' }).expect(201)).body.data._id;
  math = (await request(app).post(api('/subjects')).set(A()).send({ name: 'Mathematics', code: 'MTH7' }).expect(201)).body.data._id;
  english = (await request(app).post(api('/subjects')).set(A()).send({ name: 'English', code: 'ENG7' }).expect(201)).body.data._id;

  const admit = async (firstName: string, sectionId: string, rollNumber: string) =>
    (
      await request(app)
        .post(api('/students'))
        .set(A())
        .send({
          firstName,
          lastName: 'Exams',
          dateOfBirth: '2013-02-02',
          gender: 'MALE',
          classId,
          sectionId,
          rollNumber,
          guardians: [{ firstName: 'Parent', lastName: 'Exams', phone: '+1-555-8888', relation: 'FATHER', email: `p-${firstName}-${Date.now()}@exams.test` }],
        })
        .expect(201)
    ).body.data._id as string;
  s1 = await admit('Asad', sectionA, '1');
  s2 = await admit('Bina', sectionA, '2');
  s3 = await admit('Cyrus', sectionB, '1');

  const email = `maths-${Date.now()}@exams.test`;
  const teacher = await request(app)
    .post(api('/teachers'))
    .set(A())
    .send({ firstName: 'Mira', lastName: 'Maths', email, joiningDate: '2025-01-01', subjectIds: [math] })
    .expect(201);
  // Marks entry follows teaching assignments: Maths in both sections of this class.
  for (const sectionId of [sectionA, sectionB]) {
    await request(app)
      .post(api('/teaching-assignments'))
      .set(A())
      .send({ teacherId: teacher.body.data._id, sectionId, subjectId: math })
      .expect(201);
  }
  teacherToken = await signIn(email, 'Teacher123!');
}, 180_000);

afterAll(async () => {
  await disconnectDB();
  await mailerQueue.close();
  redis.disconnect();
});

describe('Exams and the date sheet', () => {
  it('creates an exam and its papers once per class and subject', async () => {
    const exam = await request(app)
      .post(api('/exams'))
      .set(A())
      .send({ name: 'Mid-term', type: 'MIDTERM', startDate: '2026-10-01', endDate: '2026-10-10' })
      .expect(201);
    examId = exam.body.data._id;
    await request(app).post(api('/exams')).set(A()).send({ name: 'mid-term', startDate: '2026-10-01', endDate: '2026-10-10' }).expect(409);

    const body = {
      classIds: [classId],
      subjects: [
        { subjectId: math, maxMarks: 100, passMarks: 33, date: '2026-10-02' },
        { subjectId: english, maxMarks: 50, passMarks: 17, date: '2026-10-03' },
      ],
    };
    const added = await request(app).post(api(`/exams/${examId}/papers`)).set(A()).send(body).expect(201);
    expect(added.body.data).toEqual({ created: 2, skipped: 0 });
    const again = await request(app).post(api(`/exams/${examId}/papers`)).set(A()).send(body).expect(201);
    expect(again.body.data).toEqual({ created: 0, skipped: 2 });
    await request(app)
      .post(api(`/exams/${examId}/papers`))
      .set(A())
      .send({ classIds: [classId], subjects: [{ subjectId: math, maxMarks: 10, passMarks: 20 }] })
      .expect(400);

    const detail = await request(app).get(api(`/exams/${examId}`)).set(A()).expect(200);
    const papers = detail.body.data.papers as { _id: string; subjectId: { _id: string }; classStrength: number }[];
    mathPaper = papers.find((p) => p.subjectId._id === math)!._id;
    englishPaper = papers.find((p) => p.subjectId._id === english)!._id;
    expect(papers[0]!.classStrength).toBe(3);
    expect(detail.body.data.status).toBe('IN_PROGRESS');
  });
});

describe('Marks entry', () => {
  it('lets a teacher enter marks only for the subject they teach, within max marks', async () => {
    const mine = await request(app).get(api('/exams/papers?mine=true')).set(auth(teacherToken)).expect(200);
    expect(mine.body.data.items.map((p: { _id: string }) => p._id)).toEqual([mathPaper]);

    await request(app).put(api(`/exams/papers/${mathPaper}/marks`)).set(auth(teacherToken)).send({ entries: [{ studentId: s1, marksObtained: 101 }] }).expect(400);
    await request(app).put(api(`/exams/papers/${mathPaper}/marks`)).set(auth(teacherToken)).send({ entries: [{ studentId: s1, marksObtained: 72.25 }] }).expect(400);
    await request(app).put(api(`/exams/papers/${englishPaper}/marks`)).set(auth(teacherToken)).send({ entries: [{ studentId: s1, marksObtained: 40 }] }).expect(403);

    const saved = await request(app)
      .put(api(`/exams/papers/${mathPaper}/marks`))
      .set(auth(teacherToken))
      .send({ entries: [{ studentId: s1, marksObtained: 90 }, { studentId: s2, marksObtained: 45.5 }] })
      .expect(200);
    expect(saved.body.data.enteredCount).toBe(2);

    const sheet = await request(app).get(api(`/exams/papers/${mathPaper}?sectionId=${sectionA}`)).set(auth(teacherToken)).expect(200);
    expect(sheet.body.data.rows).toHaveLength(2);
    expect(sheet.body.data.canEdit).toBe(true);
  });

  it("won't submit an incomplete paper, and locks a submitted one", async () => {
    await request(app).post(api(`/exams/papers/${mathPaper}/submit`)).set(auth(teacherToken)).expect(400);
    await request(app).put(api(`/exams/papers/${mathPaper}/marks`)).set(auth(teacherToken)).send({ entries: [{ studentId: s3, marksObtained: null, isAbsent: true }] }).expect(200);
    await request(app).post(api(`/exams/papers/${mathPaper}/submit`)).set(auth(teacherToken)).expect(200);
    await request(app).put(api(`/exams/papers/${mathPaper}/marks`)).set(auth(teacherToken)).send({ entries: [{ studentId: s1, marksObtained: 91 }] }).expect(409);
    // Verifying belongs to the exam office.
    await request(app).post(api(`/exams/papers/${mathPaper}/verify`)).set(auth(teacherToken)).expect(403);
    await request(app).post(api(`/exams/papers/${mathPaper}/verify`)).set(A()).expect(200);
  });

  it('returns a paper for a fix and takes it through again', async () => {
    await request(app)
      .put(api(`/exams/papers/${englishPaper}/marks`))
      .set(A())
      .send({ entries: [{ studentId: s1, marksObtained: 40 }, { studentId: s2, marksObtained: 50 }, { studentId: s3, marksObtained: 30 }] })
      .expect(200);
    await request(app).post(api(`/exams/papers/${englishPaper}/submit`)).set(A()).expect(200);
    await request(app).post(api(`/exams/papers/${englishPaper}/return`)).set(A()).send({ reason: 'Re-check Bina' }).expect(200);
    await request(app).post(api(`/exams/${examId}/publish`)).set(A()).send({ classIds: [classId] }).expect(400);
    await request(app).post(api(`/exams/papers/${englishPaper}/submit`)).set(A()).expect(200);
    await request(app).post(api(`/exams/papers/${englishPaper}/verify`)).set(A()).expect(200);
  });
});

describe('Publishing and results', () => {
  it('grades, totals and ranks every student in one publish, then locks the marks', async () => {
    await request(app).post(api(`/exams/${examId}/publish`)).set(auth(teacherToken)).send({ classIds: [classId] }).expect(403);
    const pub = await request(app).post(api(`/exams/${examId}/publish`)).set(A()).send({ classIds: [classId] }).expect(200);
    expect(pub.body.data.classes[0]).toMatchObject({ students: 3, passed: 2 });

    const list = await request(app).get(api(`/exams/results?examId=${examId}`)).set(A()).expect(200);
    const rows = list.body.data.items as {
      studentId: string;
      totalObtained: number;
      percentage: number;
      grade: string;
      result: string;
      classRank: number;
      sectionRank: number;
      subjects: { name: string; grade: string; passed: boolean }[];
    }[];
    const by = (id: string) => rows.find((r) => r.studentId === id)!;
    // 90 + 40 = 130 / 150
    expect(by(s1)).toMatchObject({ totalObtained: 130, percentage: 86.67, grade: 'A', result: 'PASS', classRank: 1, sectionRank: 1 });
    // 45.5 + 50 = 95.5 / 150
    expect(by(s2)).toMatchObject({ totalObtained: 95.5, percentage: 63.67, grade: 'C', result: 'PASS', classRank: 2, sectionRank: 2 });
    // absent in maths → fails, whatever the English mark
    expect(by(s3)).toMatchObject({ totalObtained: 30, percentage: 20, grade: 'F', result: 'FAIL', classRank: 3, sectionRank: 1 });
    expect(by(s3).subjects.find((x) => x.name === 'Mathematics')).toMatchObject({ grade: 'AB', passed: false });
    expect(rows.map((r) => r.studentId)).toEqual([s1, s2, s3]); // ranked order

    await request(app).post(api(`/exams/${examId}/publish`)).set(A()).send({ classIds: [classId] }).expect(409);
    await request(app).post(api(`/exams/papers/${englishPaper}/return`)).set(A()).send({ reason: 'Too late' }).expect(409);
    await request(app).patch(api(`/exams/papers/${mathPaper}`)).set(A()).send({ maxMarks: 80 }).expect(409);
    await request(app).delete(api(`/exams/${examId}`)).set(A()).expect(409);
  });

  it('prints a report card and analyses the exam', async () => {
    const list = await request(app).get(api(`/exams/results?examId=${examId}&studentId=${s1}`)).set(auth(teacherToken)).expect(200);
    const card = await request(app).get(api(`/exams/results/${list.body.data.items[0]._id}`)).set(A()).expect(200);
    expect(card.body.data.school.name).toBeTruthy();
    expect(card.body.data.gradingBands.length).toBeGreaterThan(2);
    expect(card.body.data.guardian.firstName).toBe('Parent');

    const a = await request(app).get(api(`/exams/${examId}/analysis`)).set(A()).expect(200);
    expect(a.body.data).toMatchObject({ students: 3, passed: 2, passPercent: 66.67 });
    const maths = (a.body.data.subjects as { name: string; passed: number; absent: number }[]).find((x) => x.name === 'Mathematics');
    expect(maths).toMatchObject({ passed: 2, absent: 1 });
    expect(a.body.data.toppers[0].student.name).toBe('Asad Exams');
  });

  it('withdraws a class for correction and republishes the fixed marks', async () => {
    await request(app).post(api(`/exams/${examId}/withdraw`)).set(A()).send({ classId, reason: 'Wrong maths mark' }).expect(200);
    expect((await request(app).get(api(`/exams/results?examId=${examId}`)).set(A()).expect(200)).body.data.items).toHaveLength(0);

    await request(app).post(api(`/exams/papers/${mathPaper}/return`)).set(A()).send({ reason: 'Bina re-marked' }).expect(200);
    await request(app).put(api(`/exams/papers/${mathPaper}/marks`)).set(auth(teacherToken)).send({ entries: [{ studentId: s2, marksObtained: 95 }] }).expect(200);
    await request(app).post(api(`/exams/papers/${mathPaper}/submit`)).set(auth(teacherToken)).expect(200);
    await request(app).post(api(`/exams/papers/${mathPaper}/verify`)).set(A()).expect(200);
    await request(app).post(api(`/exams/${examId}/publish`)).set(A()).send({ classIds: [classId] }).expect(200);

    const list = await request(app).get(api(`/exams/results?examId=${examId}`)).set(A()).expect(200);
    // Bina: 95 + 50 = 145 → now first.
    expect(list.body.data.items[0]).toMatchObject({ studentId: s2, classRank: 1, grade: 'A+' });
  });

  it("splits a student's results into term exams and class tests by exam type", async () => {
    const terms = await request(app).get(api(`/exams/results?studentId=${s1}&examType=MIDTERM,FINAL`)).set(A()).expect(200);
    expect(terms.body.data.items.map((r: { examId: string }) => r.examId)).toEqual([examId]);
    const tests = await request(app).get(api(`/exams/results?studentId=${s1}&examType=UNIT_TEST,MOCK`)).set(A()).expect(200);
    expect(tests.body.data.items).toHaveLength(0);
    await request(app).get(api(`/exams/results?examId=${examId}&examType=UNIT_TEST`)).set(A()).expect(200).expect((r) => expect(r.body.data.items).toHaveLength(0));
    await request(app).get(api('/exams/results?examType=QUIZ')).set(A()).expect(400);
  });
});

describe('Grading scale', () => {
  it('rejects a scale that leaves some scores ungraded, and saves a valid one', async () => {
    await request(app)
      .patch(api('/exams/settings'))
      .set(A())
      .send({ gradingBands: [{ grade: 'P', minPercent: 50 }, { grade: 'D', minPercent: 80 }] })
      .expect(400);
    const saved = await request(app)
      .patch(api('/exams/settings'))
      .set(A())
      .send({ gradingBands: [{ grade: 'Pass', minPercent: 40 }, { grade: 'Fail', minPercent: 0 }, { grade: 'Dist', minPercent: 75 }], showPositions: false })
      .expect(200);
    expect(saved.body.data.gradingBands.map((b: { grade: string }) => b.grade)).toEqual(['Dist', 'Pass', 'Fail']);
    expect(saved.body.data.showPositions).toBe(false);

    // A published report card keeps the key it was graded with, not the new scale.
    const list = await request(app).get(api(`/exams/results?examId=${examId}&limit=1`)).set(A()).expect(200);
    const card = await request(app).get(api(`/exams/results/${list.body.data.items[0]._id}`)).set(A()).expect(200);
    expect(card.body.data.gradingBands.map((b: { grade: string }) => b.grade)).toContain('A+');
    expect(card.body.data.gradingBands.map((b: { grade: string }) => b.grade)).not.toContain('Dist');
    await request(app).patch(api('/exams/settings')).set(auth(teacherToken)).send({ showPositions: true }).expect(403);
  });
});

describe('Class-wise date sheet and student-wise marks', () => {
  let termId: string;
  let science: string;

  it("builds one class's date sheet, then reschedules it without duplicating papers", async () => {
    termId = (await request(app).post(api('/exams')).set(A()).send({ name: 'Final term', type: 'FINAL', startDate: '2026-12-01', endDate: '2026-12-12' }).expect(201)).body
      .data._id;
    science = (await request(app).post(api('/subjects')).set(A()).send({ name: 'Science', code: 'SCI7' }).expect(201)).body.data._id;
    const sheet = {
      papers: [
        { subjectId: math, date: '2026-12-01', startTime: '09:00', maxMarks: 100, passMarks: 33 },
        { subjectId: english, date: '2026-12-02', maxMarks: 75, passMarks: 25 },
      ],
    };
    const first = await request(app).put(api(`/exams/${termId}/classes/${classId}/date-sheet`)).set(A()).send(sheet).expect(200);
    expect(first.body.data).toEqual({ created: 2, updated: 0 });

    // Moving English and adding Science: one update, one create, nothing duplicated.
    const second = await request(app)
      .put(api(`/exams/${termId}/classes/${classId}/date-sheet`))
      .set(A())
      .send({ papers: [{ ...sheet.papers[1], date: '2026-12-03' }, { subjectId: science, date: '2026-12-04', maxMarks: 50, passMarks: 17 }] })
      .expect(200);
    expect(second.body.data).toEqual({ created: 1, updated: 1 });

    await request(app)
      .put(api(`/exams/${termId}/classes/${classId}/date-sheet`))
      .set(A())
      .send({ papers: [{ subjectId: math, date: '2027-01-05', maxMarks: 100, passMarks: 33 }] })
      .expect(400);
    await request(app).put(api(`/exams/${termId}/classes/${classId}/date-sheet`)).set(auth(teacherToken)).send(sheet).expect(403);

    const detail = await request(app).get(api(`/exams/${termId}`)).set(A()).expect(200);
    const papers = detail.body.data.papers as { subjectId: { _id: string }; date: string; startTime?: string }[];
    expect(papers).toHaveLength(3);
    expect(papers.find((p) => p.subjectId._id === english)!.date.slice(0, 10)).toBe('2026-12-03');
    expect(papers.find((p) => p.subjectId._id === math)!.startTime).toBe('09:00');
  });

  it('creates an exam together with its date sheet for the chosen grades, or not at all', async () => {
    const withSheet = {
      name: 'Monthly test',
      type: 'UNIT_TEST',
      startDate: '2026-11-02',
      endDate: '2026-11-04',
      dateSheet: {
        classIds: [classId],
        papers: [
          { subjectId: math, date: '2026-11-02', maxMarks: 25, passMarks: 9 },
          { subjectId: english, date: '2026-11-03', maxMarks: 25, passMarks: 9 },
        ],
      },
    };
    // A paper outside the exam's dates rejects the whole thing — no half-made exam is left behind.
    const bad = { ...withSheet, dateSheet: { ...withSheet.dateSheet, papers: [{ subjectId: math, date: '2026-11-09', maxMarks: 25, passMarks: 9 }] } };
    await request(app).post(api('/exams')).set(A()).send(bad).expect(400);
    const created = await request(app).post(api('/exams')).set(A()).send(withSheet).expect(201);
    expect(created.body.data.papers).toHaveLength(2);
    expect(created.body.data.papers.map((p: { date: string }) => p.date.slice(0, 10)).sort()).toEqual(['2026-11-02', '2026-11-03']);
  });

  it('shows every class as a card with its marks progress', async () => {
    const board = await request(app).get(api(`/exams/${termId}/board`)).set(A()).expect(200);
    const card = (board.body.data.classes as { _id: string; papers: number; students: number; totalMax: number; marksExpected: number; sections: unknown[] }[]).find(
      (c) => c._id === classId,
    )!;
    expect(card).toMatchObject({ papers: 3, students: 3, totalMax: 225, marksExpected: 9, marksEntered: 0 });
    expect(card.sections).toHaveLength(2);
    const teacherBoard = await request(app).get(api(`/exams/${termId}/board`)).set(auth(teacherToken)).expect(200);
    expect(teacherBoard.body.data.classes.find((c: { _id: string }) => c._id === classId).yourPapers).toBe(1);
  });

  it("saves all of a student's subjects at once and totals them on the class sheet", async () => {
    const before = await request(app).get(api(`/exams/${termId}/classes/${classId}/marks?sectionId=${sectionA}`)).set(A()).expect(200);
    expect(before.body.data.rows).toHaveLength(2);
    const ids = Object.fromEntries((before.body.data.papers as { _id: string; subject: { _id: string } }[]).map((p) => [p.subject._id, p._id]));

    const entries = [
      { examPaperId: ids[math], marksObtained: 80 },
      { examPaperId: ids[english], marksObtained: 60.5 },
      { examPaperId: ids[science], marksObtained: null, isAbsent: true },
    ];
    await request(app).put(api(`/exams/${termId}/students/${s1}/marks`)).set(A()).send({ entries: [{ examPaperId: ids[english], marksObtained: 76 }] }).expect(400);
    const saved = await request(app).put(api(`/exams/${termId}/students/${s1}/marks`)).set(A()).send({ entries }).expect(200);
    expect(saved.body.data.saved).toBe(3);

    // A teacher may save only the subject they teach.
    await request(app).put(api(`/exams/${termId}/students/${s2}/marks`)).set(auth(teacherToken)).send({ entries: [{ examPaperId: ids[english], marksObtained: 50 }] }).expect(403);
    await request(app).put(api(`/exams/${termId}/students/${s2}/marks`)).set(auth(teacherToken)).send({ entries: [{ examPaperId: ids[math], marksObtained: 70 }] }).expect(200);
    // A paper from another class's date sheet — here, the mid-term — is refused.
    await request(app).put(api(`/exams/${termId}/students/${s1}/marks`)).set(A()).send({ entries: [{ examPaperId: mathPaper, marksObtained: 10 }] }).expect(400);

    const sheet = await request(app).get(api(`/exams/${termId}/classes/${classId}/marks`)).set(auth(teacherToken)).expect(200);
    const asad = sheet.body.data.rows.find((r: { student: { _id: string } }) => r.student._id === s1);
    expect(asad).toMatchObject({ entered: 3, totalObtained: 140.5, totalMax: 225 });
    expect(sheet.body.data.papers.filter((p: { canEdit: boolean }) => p.canEdit)).toHaveLength(1);

    // A submitted paper is locked here too, and can't be rescheduled.
    await request(app).put(api(`/exams/${termId}/students/${s2}/marks`)).set(A()).send({ entries: [{ examPaperId: ids[science], marksObtained: 40 }, { examPaperId: ids[english], marksObtained: 55 }] }).expect(200);
    await request(app).put(api(`/exams/${termId}/students/${s3}/marks`)).set(A()).send({ entries: [{ examPaperId: ids[science], marksObtained: 20 }] }).expect(200);
    await request(app).post(api(`/exams/papers/${ids[science]}/submit`)).set(A()).expect(200);
    await request(app).put(api(`/exams/${termId}/students/${s3}/marks`)).set(A()).send({ entries: [{ examPaperId: ids[science], marksObtained: 25 }] }).expect(409);
    await request(app)
      .put(api(`/exams/${termId}/classes/${classId}/date-sheet`))
      .set(A())
      .send({ papers: [{ subjectId: science, date: '2026-12-05', maxMarks: 50, passMarks: 17 }] })
      .expect(409);
  }, 120_000);

  it("never reaches another school's exam, class or student", async () => {
    const B = auth(fx.b.token);
    await request(app).get(api(`/exams/${termId}/board`)).set(B).expect(404);
    await request(app).get(api(`/exams/${termId}/classes/${classId}/marks`)).set(B).expect(404);
    await request(app)
      .put(api(`/exams/${termId}/classes/${classId}/date-sheet`))
      .set(B)
      .send({ papers: [{ subjectId: math, maxMarks: 100, passMarks: 33 }] })
      .expect(404);
    await request(app).put(api(`/exams/${termId}/students/${s1}/marks`)).set(B).send({ entries: [{ examPaperId: mathPaper, marksObtained: 1 }] }).expect(404);
  });
});
