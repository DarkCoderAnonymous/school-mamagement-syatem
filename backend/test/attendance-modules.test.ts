import request from 'supertest';
import { createApp } from '../src/app';
import { connectDB, disconnectDB } from '../src/db/connection';
import { ensureRbacSeeded } from '../src/rbac/seedRbac';
import { User } from '../src/models/User';
import { AuditLog } from '../src/models/AuditLog';
import { Teacher } from '../src/models/Teacher';
import { hashPassword } from '../src/utils/password';
import { redis } from '../src/config/redis';
import { mailerQueue } from '../src/jobs/mailer.queue';
import { asSystem } from './helpers/as-system';
import { buildFixture, type CrossTenantFixture } from './cross-tenant/fixture';

/**
 * Teaching assignments and the daily register: who may mark which section
 * on which day, and how assignments narrow marks entry to a teacher's own
 * classes. Tenant isolation for both models comes from the cross-tenant
 * registry; this covers behaviour inside a school.
 */
const app = createApp();
let fx: CrossTenantFixture;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const A = () => auth(fx.a.token);
const api = (path: string) => `/api/v1${path}`;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));

async function signIn(email: string, password: string): Promise<string> {
  await asSystem(async () =>
    User.updateOne({ email }, { $set: { passwordHash: await hashPassword(password), mustChangePassword: false } }),
  );
  const res = await request(app).post(api('/auth/login')).send({ email, password }).expect(200);
  return res.body.data.accessToken as string;
}

let today: string;
let grade5: string;
let grade6: string;
let sec5A: string;
let sec5B: string;
let sec6A: string;
let math: string;
let s1: string;
let s2: string;
let s3: string;
let s4: string;
/** Real records in the other school, for the isolation checks (the fixture's `ids` are only filled by the cross-tenant suite). */
const otherSchool = { section: '', employee: '' };
const teachers: Record<'classTeacher' | 'mathsTeacher' | 'unassigned', { id: string; token: string }> = {} as never;

beforeAll(async () => {
  await connectDB();
  await ensureRbacSeeded();
  fx = await buildFixture(app);

  // A session around the real today, so "today" and "yesterday" are both in it.
  const now = isoDay(new Date());
  await request(app)
    .post(api('/academic-sessions'))
    .set(A())
    .send({ name: `Attendance ${Date.now()}`, startDate: addDays(now, -200), endDate: addDays(now, 200), isCurrent: true })
    .expect(201);
  grade5 = (await request(app).post(api('/classes')).set(A()).send({ name: 'Grade 5', order: 5 }).expect(201)).body.data._id;
  grade6 = (await request(app).post(api('/classes')).set(A()).send({ name: 'Grade 6', order: 6 }).expect(201)).body.data._id;
  const section = async (classId: string, name: string) =>
    (await request(app).post(api('/sections')).set(A()).send({ classId, name }).expect(201)).body.data._id as string;
  sec5A = await section(grade5, 'A');
  sec5B = await section(grade5, 'B');
  sec6A = await section(grade6, 'A');
  math = (await request(app).post(api('/subjects')).set(A()).send({ name: 'Mathematics', code: `MA${Date.now() % 100000}` }).expect(201)).body.data._id;

  const admit = async (firstName: string, classId: string, sectionId: string, rollNumber: string) =>
    (
      await request(app)
        .post(api('/students'))
        .set(A())
        .send({
          firstName,
          lastName: 'Register',
          dateOfBirth: '2015-02-02',
          gender: 'FEMALE',
          classId,
          sectionId,
          rollNumber,
          guardians: [{ firstName: 'Parent', lastName: firstName, phone: '+1-555-7777', relation: 'MOTHER', email: `p-${firstName}-${Date.now()}@attendance.test` }],
        })
        .expect(201)
    ).body.data._id as string;
  s1 = await admit('Ayla', grade5, sec5A, '1');
  s2 = await admit('Bano', grade5, sec5A, '2');
  s3 = await admit('Cira', grade5, sec5B, '1');
  s4 = await admit('Dua', grade6, sec6A, '1');

  for (const key of ['classTeacher', 'mathsTeacher', 'unassigned'] as const) {
    const email = `${key}-${Date.now()}@attendance.test`.toLowerCase();
    const res = await request(app)
      .post(api('/teachers'))
      .set(A())
      .send({ firstName: 'Tara', lastName: key, email, joiningDate: '2025-01-01', subjectIds: [math] })
      .expect(201);
    teachers[key] = { id: res.body.data._id, token: await signIn(email, 'Teacher123!') };
  }
  await request(app).patch(api(`/sections/${sec5A}`)).set(A()).send({ classTeacherId: teachers.classTeacher.id }).expect(200);

  // Every day a school day, so the tests don't depend on what weekday they run.
  await request(app).patch(api('/attendance/settings')).set(A()).send({ weeklyOffDays: [], teacherBackdateDays: 2 }).expect(200);
  const board = await request(app).get(api('/attendance/board')).set(A()).expect(200);
  today = board.body.data.today;

  const B = () => auth(fx.b.token);
  await request(app)
    .post(api('/academic-sessions'))
    .set(B())
    .send({ name: `Other ${Date.now()}`, startDate: addDays(now, -200), endDate: addDays(now, 200), isCurrent: true })
    .expect(201);
  const bClass = (await request(app).post(api('/classes')).set(B()).send({ name: 'Grade 5' }).expect(201)).body.data._id;
  otherSchool.section = (await request(app).post(api('/sections')).set(B()).send({ classId: bClass, name: 'A' }).expect(201)).body.data._id;
  otherSchool.employee = (
    await request(app).post(api('/teachers')).set(B()).send({ firstName: 'Other', lastName: 'School', email: `other-${Date.now()}@attendance.test` }).expect(201)
  ).body.data.employee._id;
}, 180_000);

afterAll(async () => {
  await disconnectDB();
  await mailerQueue.close();
  redis.disconnect();
});

const assign = (token: string, body: Record<string, unknown>) =>
  request(app).post(api('/teaching-assignments')).set(auth(token)).send(body);
const saveRegister = (token: string, sectionId: string, date: string, entries: { studentId: string; status: string; remark?: string }[]) =>
  request(app).put(api('/attendance/register')).set(auth(token)).send({ sectionId, date, entries });

describe('Teaching assignments', () => {
  it('assigns a teacher a subject in several sections, once each', async () => {
    await assign(fx.a.token, { teacherId: teachers.mathsTeacher.id, sectionId: sec5B, subjectId: math }).expect(201);
    await assign(fx.a.token, { teacherId: teachers.mathsTeacher.id, sectionId: sec6A, subjectId: math }).expect(201);
    await assign(fx.a.token, { teacherId: teachers.mathsTeacher.id, sectionId: sec5B, subjectId: math }).expect(409);
    // A teacher can't hand themselves classes.
    await assign(teachers.unassigned.token, { teacherId: teachers.unassigned.id, sectionId: sec5A, subjectId: math }).expect(403);

    const list = await request(app).get(api(`/teaching-assignments?teacherId=${teachers.mathsTeacher.id}`)).set(A()).expect(200);
    expect(list.body.data.items).toHaveLength(2);
    expect(list.body.data.items[0]).toMatchObject({ subjectId: { name: 'Mathematics' }, classId: { name: 'Grade 5' } });
  });

  it("refuses another school's section", async () => {
    const res = await assign(fx.a.token, { teacherId: teachers.mathsTeacher.id, sectionId: otherSchool.section, subjectId: math }).expect(400);
    expect(res.body.error.message).toBe('Section not found');
  });

  it("shows a teacher their own classes, class-teacher sections included", async () => {
    const mine = await request(app).get(api('/teaching-assignments/mine')).set(auth(teachers.mathsTeacher.token)).expect(200);
    const sections = mine.body.data.sections as { section: { name: string }; class: { name: string }; isClassTeacher: boolean; subjects: { name: string }[] }[];
    expect(sections.map((s) => `${s.class.name}-${s.section.name}`)).toEqual(['Grade 5-B', 'Grade 6-A']);
    expect(sections[0]!.subjects.map((s) => s.name)).toEqual(['Mathematics']);

    const own = await request(app).get(api('/teaching-assignments/mine')).set(auth(teachers.classTeacher.token)).expect(200);
    expect(own.body.data.sections).toEqual([expect.objectContaining({ isClassTeacher: true, subjects: [] })]);
  });

  it("lists any teacher's classes for a session, with each section's roll", async () => {
    const res = await request(app).get(api(`/teaching-assignments/teachers/${teachers.mathsTeacher.id}`)).set(A()).expect(200);
    const data = res.body.data as {
      academicSession: { isCurrent: boolean } | null;
      sections: { section: { name: string }; class: { name: string }; isClassTeacher: boolean; subjects: { name: string }[]; studentCount: number }[];
    };
    expect(data.academicSession?.isCurrent).toBe(true);
    expect(data.sections.map((s) => [`${s.class.name}-${s.section.name}`, s.studentCount])).toEqual([
      ['Grade 5-B', 1],
      ['Grade 6-A', 1],
    ]);
    expect(data.sections[0]!.subjects.map((s) => s.name)).toEqual(['Mathematics']);

    const lead = await request(app).get(api(`/teaching-assignments/teachers/${teachers.classTeacher.id}`)).set(A()).expect(200);
    expect(lead.body.data.sections).toEqual([expect.objectContaining({ isClassTeacher: true, subjects: [], studentCount: 2 })]);

    // Another session of this school has none of this year's classes.
    const past = await request(app)
      .post(api('/academic-sessions'))
      .set(A())
      .send({ name: `Past ${Date.now()}`, startDate: '2020-04-01', endDate: '2021-03-31' })
      .expect(201);
    const old = await request(app).get(api(`/teaching-assignments/teachers/${teachers.mathsTeacher.id}?academicSessionId=${past.body.data._id}`)).set(A()).expect(200);
    expect(old.body.data).toMatchObject({ academicSession: { _id: past.body.data._id, isCurrent: false }, sections: [] });
    await request(app).get(api(`/teaching-assignments/teachers/${teachers.mathsTeacher.id}?academicSessionId=${otherSchool.section}`)).set(A()).expect(400);
  });

  it('limits marks entry to the classes a teacher is assigned', async () => {
    const exam = await request(app)
      .post(api('/exams'))
      .set(A())
      .send({ name: `Unit test ${Date.now()}`, type: 'UNIT_TEST', startDate: today, endDate: addDays(today, 5) })
      .expect(201);
    await request(app)
      .post(api(`/exams/${exam.body.data._id}/papers`))
      .set(A())
      .send({ classIds: [grade5, grade6], subjects: [{ subjectId: math, maxMarks: 50, passMarks: 17 }] })
      .expect(201);
    const detail = await request(app).get(api(`/exams/${exam.body.data._id}`)).set(A()).expect(200);
    const papers = detail.body.data.papers as { _id: string; classId: string | { _id: string } }[];
    const paperFor = (classId: string) => papers.find((p) => (typeof p.classId === 'string' ? p.classId : p.classId._id) === classId)!._id;

    // Assigned Maths in 5-B and 6-A: both classes' Maths papers are theirs.
    await request(app).put(api(`/exams/papers/${paperFor(grade6)}/marks`)).set(auth(teachers.mathsTeacher.token)).send({ entries: [{ studentId: s4, marksObtained: 40 }] }).expect(200);
    // Maths on the teacher record alone is no longer enough.
    await request(app).put(api(`/exams/papers/${paperFor(grade6)}/marks`)).set(auth(teachers.unassigned.token)).send({ entries: [{ studentId: s4, marksObtained: 10 }] }).expect(403);
    const mine = await request(app).get(api('/exams/papers?mine=true')).set(auth(teachers.unassigned.token)).expect(200);
    expect(mine.body.data.items).toHaveLength(0);
  });
});

describe('Daily register', () => {
  it("lets the class teacher mark today's register, and shows it on the board", async () => {
    const reg = await request(app).get(api(`/attendance/register?sectionId=${sec5A}`)).set(auth(teachers.classTeacher.token)).expect(200);
    expect(reg.body.data.canEdit).toBe(true);
    expect(reg.body.data.rows.map((r: { student: { firstName: string } }) => r.student.firstName)).toEqual(['Ayla', 'Bano']);

    const saved = await saveRegister(teachers.classTeacher.token, sec5A, today, [
      { studentId: s1, status: 'PRESENT' },
      { studentId: s2, status: 'ABSENT', remark: 'Fever' },
    ]).expect(200);
    expect(saved.body.data.counts).toMatchObject({ PRESENT: 1, ABSENT: 1 });

    const board = await request(app).get(api('/attendance/board?mine=true')).set(auth(teachers.classTeacher.token)).expect(200);
    expect(board.body.data.sections).toEqual([
      expect.objectContaining({ _id: sec5A, students: 2, marked: 2, canMark: true, counts: expect.objectContaining({ ABSENT: 1 }) }),
    ]);
  });

  it('lets a teacher assigned to a section mark it, but not a section they have nothing to do with', async () => {
    await saveRegister(teachers.mathsTeacher.token, sec5B, today, [{ studentId: s3, status: 'LATE' }]).expect(200);
    await saveRegister(teachers.mathsTeacher.token, sec5A, today, [{ studentId: s1, status: 'ABSENT' }]).expect(403);
    await saveRegister(teachers.unassigned.token, sec5B, today, [{ studentId: s3, status: 'ABSENT' }]).expect(403);

    const reg = await request(app).get(api(`/attendance/register?sectionId=${sec5A}`)).set(auth(teachers.unassigned.token)).expect(200);
    expect(reg.body.data.canEdit).toBe(false);
    expect(reg.body.data.readOnlyReason).toMatch(/not this section/);
  });

  it('lets a teacher catch up two school days, while only the office reaches further back', async () => {
    await saveRegister(teachers.classTeacher.token, sec5A, addDays(today, -1), [{ studentId: s1, status: 'PRESENT' }]).expect(200);
    await saveRegister(teachers.classTeacher.token, sec5A, addDays(today, -2), [{ studentId: s1, status: 'PRESENT' }]).expect(200);
    const tooOld = await saveRegister(teachers.classTeacher.token, sec5A, addDays(today, -3), [{ studentId: s1, status: 'PRESENT' }]).expect(403);
    expect(tooOld.body.error.message).toMatch(/2 school days back/);
    await saveRegister(fx.a.token, sec5A, addDays(today, -3), [{ studentId: s1, status: 'LEAVE' }]).expect(200);
    await saveRegister(fx.a.token, sec5A, addDays(today, 1), [{ studentId: s1, status: 'PRESENT' }]).expect(400);
  });

  it("refuses students from another section, and duplicates", async () => {
    await saveRegister(teachers.classTeacher.token, sec5A, today, [{ studentId: s3, status: 'PRESENT' }]).expect(400);
    await saveRegister(teachers.classTeacher.token, sec5A, today, [
      { studentId: s1, status: 'PRESENT' },
      { studentId: s1, status: 'ABSENT' },
    ]).expect(400);
  });

  it('records each change once in the audit log, with before and after', async () => {
    const count = () => asSystem(() => AuditLog.countDocuments({ action: 'attendance.mark', entityId: sec5A }));
    const before = await count();
    // Unchanged rows are skipped; only Bano's status moves.
    await saveRegister(teachers.classTeacher.token, sec5A, today, [
      { studentId: s1, status: 'PRESENT' },
      { studentId: s2, status: 'PRESENT', remark: 'Arrived after all' },
    ]).expect(200);
    await saveRegister(teachers.classTeacher.token, sec5A, today, [{ studentId: s1, status: 'PRESENT' }]).expect(200);
    expect(await count()).toBe(before + 1);
    const entry = await asSystem(() => AuditLog.findOne({ action: 'attendance.mark', entityId: sec5A }).sort({ createdAt: -1 }).lean());
    expect(entry!.before).toEqual([{ studentId: s2, status: 'ABSENT', remark: 'Fever' }]);
    expect(entry!.after).toEqual([{ studentId: s2, status: 'PRESENT', remark: 'Arrived after all' }]);
  });

  it("ends an archived teacher's classes", async () => {
    await request(app).delete(api(`/teachers/${teachers.mathsTeacher.id}`)).set(A()).expect(204);
    const list = await request(app).get(api(`/teaching-assignments?teacherId=${teachers.mathsTeacher.id}`)).set(A()).expect(200);
    expect(list.body.data.items).toHaveLength(0);
  });
});

describe('School calendar', () => {
  it('is set by the office only', async () => {
    await request(app).patch(api('/attendance/settings')).set(auth(teachers.classTeacher.token)).send({ teacherBackdateDays: 7 }).expect(403);
    await request(app).post(api('/attendance/holidays')).set(auth(teachers.classTeacher.token)).send({ name: 'Mine', startDate: today }).expect(403);
    await request(app).post(api('/attendance/holidays')).set(A()).send({ name: 'Backwards', startDate: today, endDate: addDays(today, -1) }).expect(400);
  });

  it('takes no register on a holiday, and skips it in the catch-up window', async () => {
    const yesterday = addDays(today, -1);
    const holiday = await request(app).post(api('/attendance/holidays')).set(A()).send({ name: 'Founders Day', startDate: yesterday }).expect(201);

    const board = await request(app).get(api(`/attendance/board?date=${yesterday}`)).set(A()).expect(200);
    expect(board.body.data.dayOff).toBe('Founders Day');
    expect(board.body.data.sections.every((s: { canMark: boolean }) => !s.canMark)).toBe(true);
    await saveRegister(fx.a.token, sec5A, yesterday, [{ studentId: s1, status: 'PRESENT' }]).expect(400);

    // Yesterday doesn't count, so two school days back now reaches three calendar days.
    await saveRegister(teachers.classTeacher.token, sec5A, addDays(today, -3), [{ studentId: s1, status: 'PRESENT' }]).expect(200);
    const mine = await request(app).get(api('/attendance/board?mine=true')).set(auth(teachers.classTeacher.token)).expect(200);
    expect(mine.body.data.earliestEditable).toBe(addDays(today, -3));
    // Only Ayla was marked on those days, so both registers are waiting to be finished.
    expect(mine.body.data.missed).toEqual([
      expect.objectContaining({ date: addDays(today, -3), section: expect.objectContaining({ _id: sec5A }), marked: 1, students: 2 }),
      expect.objectContaining({ date: addDays(today, -2), section: expect.objectContaining({ _id: sec5A }), marked: 1, students: 2 }),
    ]);

    await request(app).delete(api(`/attendance/holidays/${holiday.body.data._id}`)).set(A()).expect(204);
    await saveRegister(fx.a.token, sec5A, yesterday, [{ studentId: s1, status: 'PRESENT' }]).expect(200);
  });

  it('takes no register on a weekly day off', async () => {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    await request(app).patch(api('/attendance/settings')).set(A()).send({ weeklyOffDays: [weekday] }).expect(200);
    const res = await saveRegister(teachers.classTeacher.token, sec5A, today, [{ studentId: s1, status: 'ABSENT' }]).expect(400);
    expect(res.body.error.message).toMatch(/is a day off/);
    const reg = await request(app).get(api(`/attendance/register?sectionId=${sec5A}`)).set(auth(teachers.classTeacher.token)).expect(200);
    expect(reg.body.data).toMatchObject({ canEdit: false, dayOff: expect.stringMatching(/day off/) });
    await request(app).patch(api('/attendance/settings')).set(A()).send({ weeklyOffDays: [] }).expect(200);
  });
});

describe('Staff register', () => {
  const employeeOf = async (teacherId: string) =>
    (await request(app).get(api(`/teachers/${teacherId}`)).set(A()).expect(200)).body.data.employee._id as string;
  const saveStaff = (token: string, date: string, entries: { employeeId: string; status: string; remark?: string }[]) =>
    request(app).put(api('/staff-attendance/register')).set(auth(token)).send({ date, entries });
  let lead: string;
  let other: string;

  beforeAll(async () => {
    lead = await employeeOf(teachers.classTeacher.id);
    other = await employeeOf(teachers.unassigned.id);
  });

  it('is taken by the office and hidden from teachers', async () => {
    const reg = await request(app).get(api('/staff-attendance/register')).set(A()).expect(200);
    const ids = (reg.body.data.rows as { employee: { _id: string } }[]).map((r) => r.employee._id);
    expect(ids).toEqual(expect.arrayContaining([lead, other]));
    // Archived staff drop off the register.
    expect(ids).not.toContain(await asSystem(async () => String((await Teacher.findById(teachers.mathsTeacher.id).lean())!.employeeId)));

    await request(app).get(api('/staff-attendance/register')).set(auth(teachers.classTeacher.token)).expect(403);
    await saveStaff(teachers.classTeacher.token, today, [{ employeeId: lead, status: 'PRESENT' }]).expect(403);

    const saved = await saveStaff(fx.a.token, today, [
      { employeeId: lead, status: 'HALF_DAY', remark: 'Left at noon' },
      { employeeId: other, status: 'ABSENT' },
    ]).expect(200);
    expect(saved.body.data.counts).toMatchObject({ HALF_DAY: 1, ABSENT: 1 });
  });

  it('refuses future days, days off, and people from another school', async () => {
    await saveStaff(fx.a.token, addDays(today, 1), [{ employeeId: lead, status: 'PRESENT' }]).expect(400);
    const foreign = await saveStaff(fx.a.token, today, [{ employeeId: otherSchool.employee, status: 'PRESENT' }]).expect(400);
    expect(foreign.body.error.message).toMatch(/aren't on the staff register/);
    const holiday = await request(app).post(api('/attendance/holidays')).set(A()).send({ name: 'Staff day off', startDate: addDays(today, -5) }).expect(201);
    await saveStaff(fx.a.token, addDays(today, -5), [{ employeeId: lead, status: 'PRESENT' }]).expect(400);
    await request(app).delete(api(`/attendance/holidays/${holiday.body.data._id}`)).set(A()).expect(204);
  });

  it('sums unpaid days into the month and prefills them on payslips, until someone overrides', async () => {
    const month = today.slice(0, 7);
    const summary = await request(app).get(api(`/staff-attendance/summary?month=${month}`)).set(A()).expect(200);
    const rowOf = (id: string) => (summary.body.data.rows as { employee: { _id: string }; unpaidDays: number }[]).find((r) => r.employee._id === id)!;
    expect(rowOf(lead).unpaidDays).toBe(0.5);
    expect(rowOf(other).unpaidDays).toBe(1);

    await request(app).post(api('/payroll/structures')).set(A()).send({ employeeId: lead, basicMinor: 30000, components: [] }).expect(201);
    const run = await request(app).post(api('/payroll/runs')).set(A()).send({ month }).expect(201);
    const slipOf = (data: { payslips: { _id: string; employeeId: string; unpaidLeaveDays: number; unpaidLeaveOverridden: boolean }[] }) =>
      data.payslips.find((p) => p.employeeId === lead)!;
    expect(slipOf(run.body.data)).toMatchObject({ unpaidLeaveDays: 0.5, unpaidLeaveOverridden: false });

    // The register changes; recalculating follows it.
    await saveStaff(fx.a.token, today, [{ employeeId: lead, status: 'ABSENT' }]).expect(200);
    const recalculated = await request(app).post(api(`/payroll/runs/${run.body.data._id}/recalculate`)).set(A()).expect(200);
    expect(slipOf(recalculated.body.data).unpaidLeaveDays).toBe(1);

    // A hand-set number survives the next recalculation.
    await request(app).patch(api(`/payroll/payslips/${slipOf(recalculated.body.data)._id}`)).set(A()).send({ unpaidLeaveDays: 0 }).expect(200);
    const again = await request(app).post(api(`/payroll/runs/${run.body.data._id}/recalculate`)).set(A()).expect(200);
    expect(slipOf(again.body.data)).toMatchObject({ unpaidLeaveDays: 0, unpaidLeaveOverridden: true });
  });

  it("shows one person's month day by day, with month and year totals", async () => {
    const res = await request(app).get(api(`/staff-attendance/employees/${other}`)).set(A()).expect(200);
    const data = res.body.data as {
      month: string;
      days: { date: string; status: string | null; isFuture: boolean; beforeJoining: boolean }[];
      schoolDays: number;
      monthTotals: { counts: Record<string, number>; marked: number; unpaidDays: number; percentage: number | null };
      yearTotals: { year: number; marked: number; unpaidDays: number };
    };
    expect(data.month).toBe(today.slice(0, 7));
    expect(data.days.find((d) => d.date === today)!.status).toBe('ABSENT');
    expect(data.monthTotals).toMatchObject({ marked: 1, unpaidDays: 1, percentage: 0 });
    expect(data.monthTotals.counts.ABSENT).toBe(1);
    expect(data.yearTotals).toMatchObject({ year: Number(today.slice(0, 4)), marked: 1, unpaidDays: 1 });
    expect(data.days.filter((d) => d.date > today).every((d) => d.isFuture && d.status === null)).toBe(true);
    // Joined 2025-01-01, so nothing this month is before joining.
    expect(data.days.some((d) => d.beforeJoining)).toBe(false);

    await request(app).get(api(`/staff-attendance/employees/${other}`)).set(auth(teachers.classTeacher.token)).expect(403);
    await request(app).get(api(`/staff-attendance/employees/${otherSchool.employee}`)).set(A()).expect(404);
    await request(app).get(api(`/staff-attendance/employees/${other}?month=2999-01`)).set(A()).expect(400);
  });
});

describe('Monthly register', () => {
  it("lays out a section's month as students × days, with totals", async () => {
    const month = today.slice(0, 7);
    const res = await request(app).get(api(`/attendance/monthly?sectionId=${sec5A}&month=${month}`)).set(auth(teachers.classTeacher.token)).expect(200);
    const data = res.body.data as {
      days: { date: string; isFuture: boolean; counts: Record<string, number> }[];
      rows: { student: { _id: string }; marks: Record<string, string>; counts: Record<string, number>; marked: number; percentage: number | null }[];
    };
    const [y, m] = month.split('-').map(Number) as [number, number];
    expect(data.days).toHaveLength(new Date(Date.UTC(y, m, 0)).getUTCDate());
    expect(data.days.find((d) => d.date === today)!.counts.PRESENT).toBe(2);
    expect(data.days.filter((d) => d.date > today).every((d) => d.isFuture)).toBe(true);

    const ayla = data.rows.find((r) => r.student._id === s1)!;
    expect(ayla.marks[today]).toBe('PRESENT');
    expect(ayla.marked).toBe(Object.keys(ayla.marks).length);
    expect(ayla.percentage).toBe(Math.round(((ayla.counts.PRESENT! + ayla.counts.LATE!) / ayla.marked) * 1000) / 10);

    await request(app).get(api(`/attendance/monthly?sectionId=${otherSchool.section}&month=${month}`)).set(A()).expect(404);
    await request(app).get(api(`/attendance/monthly?sectionId=${sec5A}&month=2999-01`)).set(A()).expect(400);
  });
});

describe("A student's attendance", () => {
  it('shows their month day by day with month and session totals', async () => {
    const res = await request(app).get(api(`/attendance/students/${s2}`)).set(auth(teachers.classTeacher.token)).expect(200);
    const data = res.body.data as {
      month: string;
      days: { date: string; status: string | null; remark: string | null; isFuture: boolean }[];
      monthTotals: { counts: Record<string, number>; marked: number; percentage: number | null };
      sessionTotals: { marked: number };
    };
    expect(data.month).toBe(today.slice(0, 7));
    const todayRow = data.days.find((d) => d.date === today)!;
    expect(todayRow.status).not.toBeNull();
    expect(data.monthTotals.marked).toBe(data.days.filter((d) => d.status).length);
    expect(data.monthTotals.percentage).toBe(
      Math.round(((data.monthTotals.counts.PRESENT! + data.monthTotals.counts.LATE!) / data.monthTotals.marked) * 1000) / 10,
    );
    expect(data.sessionTotals.marked).toBeGreaterThanOrEqual(data.monthTotals.marked);
    expect(data.days.filter((d) => d.date > today).every((d) => d.isFuture && d.status === null)).toBe(true);

    await request(app).get(api(`/attendance/students/${s2}?month=2999-01`)).set(A()).expect(400);
    await request(app).get(api(`/attendance/students/${s2}?month=2026-13`)).set(A()).expect(400);
  });
});

describe('Dashboard', () => {
  it("adds today's registers and the collection trend, only for those who can read them", async () => {
    const admin = (await request(app).get(api('/dashboard/summary')).set(A()).expect(200)).body.data;
    expect(admin.attendance).toMatchObject({ date: today, dayOff: null, sections: 3, students: 4 });
    expect(admin.attendance.registersTaken).toBeGreaterThanOrEqual(1);
    expect(admin.attendance.counts.PRESENT).toBeGreaterThanOrEqual(2);
    expect(admin.attendance.trend.at(-1)).toMatchObject({ date: today });
    expect(admin.staffAttendance.marked).toBeGreaterThanOrEqual(2);
    expect(admin.fees.monthlyCollections).toHaveLength(6);
    expect(admin.fees.monthlyCollections.at(-1).month).toBe(today.slice(0, 7));

    const teacher = (await request(app).get(api('/dashboard/summary')).set(auth(teachers.classTeacher.token)).expect(200)).body.data;
    expect(teacher.attendance).not.toBeNull();
    expect(teacher.fees).toBeNull();
    expect(teacher.staffAttendance).toBeNull();
  });
});
