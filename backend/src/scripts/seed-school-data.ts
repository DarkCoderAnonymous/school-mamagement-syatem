import { Role } from '@sms/shared';
import { Class } from '../models/Class';
import { Subject } from '../models/Subject';
import { Teacher } from '../models/Teacher';
import { Section } from '../models/Section';
import { TeachingAssignment } from '../models/TeachingAssignment';
import { Holiday } from '../models/Holiday';
import { Student } from '../models/Student';
import { SchoolMembership } from '../models/SchoolMembership';
import { InventoryCategory } from '../models/InventoryCategory';
import { RoleModel } from '../models/Role';
import { User } from '../models/User';
import { TenantContext } from '../tenant/context';
import { hashPassword } from '../utils/password';
import type { ActorMeta } from '../utils/actor';
import { createAcademicSession, getCurrentAcademicSession } from '../modules/academic-sessions/academic-sessions.service';
import { createClass, createSection, updateSection } from '../modules/classes/classes.service';
import { createSubject } from '../modules/subjects/subjects.service';
import { createTeacher } from '../modules/teachers/teachers.service';
import { createAssignment } from '../modules/teaching-assignments/teaching-assignments.service';
import { createHoliday } from '../modules/attendance/holidays.service';
import { createStudent } from '../modules/students/students.service';
import { inviteMember } from '../modules/members/members.service';
import { createCategory, createItem, recordMovement } from '../modules/inventory/inventory.service';
import { seedFinanceData } from './seed-finance-data';
import { seedExamData } from './seed-exam-data';

/**
 * Fills one school with a believable working set — session, classes and
 * sections, subjects, teachers, students with families, office staff and a
 * stocked store room — so every screen has something on it (CLAUDE.md: "the
 * UI is never empty").
 *
 * Everything goes through the real services, inside the school's own tenant
 * context, so the demo data is exactly what the API would have produced:
 * validated, sequenced (EMP-/ADM-/ITM- numbers), transactional and audited.
 *
 * Resumable: each stage checks whether its data already exists and skips if
 * so, so a run interrupted halfway (a dropped database connection, say) is
 * finished by simply running it again — nothing is duplicated.
 */

export interface DemoLogin {
  role: string;
  email: string;
  password: string;
}

const SUBJECTS = [
  { name: 'Mathematics', code: 'MATH' },
  { name: 'English', code: 'ENG' },
  { name: 'Science', code: 'SCI' },
  { name: 'Social Studies', code: 'SST' },
  { name: 'Computer Science', code: 'CS' },
  { name: 'Physical Education', code: 'PE' },
  { name: 'Art & Design', code: 'ART', isElective: true },
  { name: 'French', code: 'FR', isElective: true },
];

const TEACHERS: { first: string; last: string; subjects: string[]; qualification: string; dept: string; years: number }[] = [
  { first: 'Hannah', last: 'Brooks', subjects: ['MATH'], qualification: 'MSc Mathematics', dept: 'Mathematics', years: 9 },
  { first: 'Daniel', last: 'Okafor', subjects: ['SCI'], qualification: 'MSc Physics', dept: 'Science', years: 6 },
  { first: 'Priya', last: 'Nair', subjects: ['ENG'], qualification: 'MA English Literature', dept: 'Languages', years: 11 },
  { first: 'Marcus', last: 'Chen', subjects: ['CS', 'MATH'], qualification: 'BSc Computer Science', dept: 'Technology', years: 4 },
  { first: 'Sofia', last: 'Alvarez', subjects: ['FR', 'ENG'], qualification: 'MA French', dept: 'Languages', years: 7 },
  { first: 'Omar', last: 'Haddad', subjects: ['SST'], qualification: 'MA History', dept: 'Humanities', years: 12 },
  { first: 'Grace', last: 'Kim', subjects: ['ART'], qualification: 'BFA Fine Arts', dept: 'Arts', years: 5 },
  { first: 'Liam', last: 'Walsh', subjects: ['PE'], qualification: 'BSc Sports Science', dept: 'Physical Education', years: 8 },
];

const GIRLS = ['Ava', 'Mia', 'Zara', 'Aisha', 'Isla', 'Chloe', 'Emma', 'Layla', 'Nora'];
const BOYS = ['Noah', 'Ethan', 'Leo', 'Lucas', 'Yusuf', 'Arjun', 'Mateo', 'Ben', 'Kai'];
const LAST = ['Patel', 'Johnson', 'Nguyen', 'Garcia', 'Ahmed', 'Smith', 'Rossi', 'Kowalski', 'Tanaka', 'Mensah', 'Silva', 'Murphy'];
const PARENT_FIRST_M = ['James', 'Ahmed', 'Carlos', 'David', 'Hiro', 'Kwame', 'Marco', 'Sean'];
const PARENT_FIRST_F = ['Sarah', 'Fatima', 'Elena', 'Maria', 'Yuki', 'Ama', 'Giulia', 'Aoife'];

const INVENTORY: { category: string; items: { name: string; unit: string; qty: number; reorder: number; cost: number; location: string }[] }[] = [
  {
    category: 'Furniture',
    items: [
      { name: 'Student desk', unit: 'PIECE', qty: 240, reorder: 20, cost: 4500, location: 'Store room 1' },
      { name: 'Student chair', unit: 'PIECE', qty: 260, reorder: 20, cost: 2200, location: 'Store room 1' },
      { name: 'Whiteboard (120×90)', unit: 'PIECE', qty: 6, reorder: 2, cost: 8900, location: 'Store room 1' },
    ],
  },
  {
    category: 'Science lab',
    items: [
      { name: 'Compound microscope', unit: 'PIECE', qty: 12, reorder: 4, cost: 18500, location: 'Lab store' },
      { name: 'Glass beaker 250ml', unit: 'BOX', qty: 8, reorder: 5, cost: 1600, location: 'Lab store, shelf B' },
      { name: 'Safety goggles', unit: 'PAIR', qty: 40, reorder: 15, cost: 450, location: 'Lab store, shelf A' },
    ],
  },
  {
    category: 'Stationery',
    items: [
      { name: 'A4 paper', unit: 'REAM', qty: 120, reorder: 30, cost: 550, location: 'Office store' },
      { name: 'Whiteboard marker', unit: 'BOX', qty: 18, reorder: 10, cost: 900, location: 'Office store' },
      { name: 'Exercise book (100 pages)', unit: 'PACK', qty: 60, reorder: 20, cost: 1200, location: 'Office store' },
    ],
  },
  {
    category: 'Sports',
    items: [
      { name: 'Football (size 5)', unit: 'PIECE', qty: 14, reorder: 5, cost: 2500, location: 'Sports shed' },
      { name: 'Cricket kit', unit: 'SET', qty: 3, reorder: 2, cost: 16000, location: 'Sports shed' },
      { name: 'Skipping rope', unit: 'PIECE', qty: 30, reorder: 10, cost: 300, location: 'Sports shed' },
    ],
  },
  {
    category: 'IT equipment',
    items: [
      { name: 'Laptop (student)', unit: 'PIECE', qty: 25, reorder: 5, cost: 42000, location: 'Computer lab' },
      { name: 'Projector', unit: 'PIECE', qty: 4, reorder: 1, cost: 38000, location: 'Computer lab' },
    ],
  },
];

/** Deterministic pick, so re-seeding a fresh database gives the same school. */
const pick = <T>(list: T[], i: number): T => list[i % list.length] as T;

async function setKnownPassword(email: string, password: string): Promise<void> {
  await User.updateOne(
    { email: email.toLowerCase() },
    { $set: { passwordHash: await hashPassword(password), mustChangePassword: false, status: 'ACTIVE' } },
  );
}

/**
 * Marks entry and the daily register follow teaching assignments, so a demo
 * teacher with none could do neither. Only runs while the school has none.
 */
async function seedTeachingAssignments(actor: ActorMeta): Promise<boolean> {
  if ((await TeachingAssignment.countDocuments({ deletedAt: null })) > 0) return false;
  const session = await getCurrentAcademicSession();
  if (!session) return false;
  const classes = await Class.find({ academicSessionId: session._id, deletedAt: null }).sort({ order: 1 }).select('_id').lean();
  const sections = await Section.find({ classId: { $in: classes.map((c) => c._id) }, deletedAt: null }).sort({ name: 1 }).lean();
  const teachers = await Teacher.find({ deletedAt: null }).sort({ createdAt: 1 }).select('subjectIds').lean();
  const subjects = [...new Set(teachers.flatMap((t) => t.subjectIds.map(String)))];

  let created = 0;
  for (const [i, section] of sections.entries()) {
    for (const subjectId of subjects) {
      const qualified = teachers.filter((t) => t.subjectIds.some((id) => String(id) === subjectId));
      const teacher = qualified[i % qualified.length];
      if (!teacher) continue;
      await createAssignment({ teacherId: String(teacher._id), sectionId: String(section._id), subjectId }, actor);
      created += 1;
    }
  }
  return created > 0;
}

export async function seedSchoolData(
  school: { schoolId: string; adminUserId: string; membershipId: string },
  domain: string,
): Promise<{ seeded: boolean; logins: DemoLogin[] }> {
  const actor: ActorMeta = { actorUserId: school.adminUserId, schoolId: school.schoolId, ip: 'seed-script' };
  const roleActor = { ...actor, membershipId: school.membershipId, permissions: [] as string[] };

  return TenantContext.run(
    {
      schoolId: school.schoolId,
      userId: school.adminUserId,
      membershipId: school.membershipId,
      role: Role.SCHOOL_ADMIN,
      isSuperAdmin: false,
    },
    async () => {
      let seededSomething = false;

      // The seed acts as the school admin, so it may grant exactly what the admin holds.
      const adminRole = await RoleModel.findOne({ schoolId: school.schoolId, name: Role.SCHOOL_ADMIN }).lean();
      roleActor.permissions = adminRole?.permissions ?? [];

      // ── Session ──
      if (!(await getCurrentAcademicSession())) {
        await createAcademicSession(
          { name: '2026-2027', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), isCurrent: true },
          actor,
        );
      }

      // ── Subjects ──
      const subjectIds = new Map<string, string>();
      if ((await Subject.countDocuments({ deletedAt: null })) === 0) {
        seededSomething = true;
        for (const s of SUBJECTS) await createSubject({ ...s, isElective: s.isElective ?? false }, actor);
      }
      for (const s of await Subject.find({ deletedAt: null }).select('code').lean()) subjectIds.set(s.code, String(s._id));

      // ── Teachers ──
      const hasTeachers = (await Teacher.countDocuments({ deletedAt: null })) > 0;
      for (const [i, t] of hasTeachers ? [] : TEACHERS.entries()) {
        seededSomething = true;
        await createTeacher(
          {
            firstName: t.first,
            lastName: t.last,
            email: `${t.first}.${t.last}@${domain}`.toLowerCase(),
            phone: `+1-555-02${String(i).padStart(2, '0')}`,
            designation: i === 0 ? 'Head of Mathematics' : 'Teacher',
            department: t.dept,
            joiningDate: new Date(Date.UTC(2026 - (i % 5), 3, 1)),
            qualification: t.qualification,
            experienceYears: t.years,
            subjectIds: t.subjects.map((c) => subjectIds.get(c)!).filter(Boolean),
          },
          actor,
        );
      }
      const teacherIds = (await Teacher.find({ deletedAt: null }).sort({ createdAt: 1 }).select('_id').lean()).map((t) =>
        String(t._id),
      );

      // ── Classes & sections (class teachers assigned round-robin) ──
      const placements: { classId: string; sectionId: string; label: string }[] = [];
      let teacherCursor = 0;
      const hasClasses = (await Class.countDocuments({ deletedAt: null })) > 0;
      for (let grade = 1; grade <= (hasClasses ? 0 : 6); grade += 1) {
        seededSomething = true;
        const cls = await createClass({ name: `Grade ${grade}`, order: grade }, actor);
        for (const name of ['A', 'B']) {
          const section = await createSection(
            { classId: String(cls._id), name, capacity: 30, room: `Block ${grade <= 3 ? 'A' : 'B'}, Room ${grade}${name}` },
            actor,
          );
          if (teacherCursor < teacherIds.length) {
            await updateSection(String(section._id), { classTeacherId: teacherIds[teacherCursor] }, actor);
            teacherCursor += 1;
          }
          placements.push({ classId: String(cls._id), sectionId: String(section._id), label: `Grade ${grade}-${name}` });
        }
      }

      // ── Students with families. Every fourth child is a sibling of the one before. ──
      const hasStudents = (await Student.countDocuments({ deletedAt: null })) > 0;
      let parentLoginEmail: string | null = hasStudents ? `parent@${domain}` : null;
      let previous: { guardianId: string; lastName: string } | null = null;
      for (let i = 0; i < (hasStudents ? 0 : placements.length * 3); i += 1) {
        seededSomething = true;
        const place = placements[i % placements.length]!;
        const isSibling: boolean = previous !== null && i % 4 === 3;
        const lastName: string = isSibling ? previous!.lastName : pick(LAST, i * 7 + 3);
        const grade = Number(place.label.split(' ')[1]!.split('-')[0]);
        const birthYear = 2026 - 6 - grade;
        const withLogin = i === 0;

        const student = await createStudent(
          {
            firstName: i % 2 === 0 ? pick(GIRLS, i * 5 + 1) : pick(BOYS, i * 5 + 1),
            lastName,
            dateOfBirth: new Date(Date.UTC(birthYear, (i * 3) % 12, 1 + (i % 27))),
            gender: i % 2 === 0 ? 'FEMALE' : 'MALE',
            classId: place.classId,
            sectionId: place.sectionId,
            rollNumber: String(Math.floor(i / placements.length) + 1),
            admissionDate: new Date(Date.UTC(2026, 3, 1 + (i % 20))),
            address: `${10 + i} Maple Street, Springfield`,
            guardians: isSibling
              ? [{ guardianId: previous!.guardianId, relation: 'MOTHER', isPrimary: true }]
              : [
                  {
                    firstName: pick(PARENT_FIRST_F, i),
                    lastName,
                    phone: `+1-555-1${String(i).padStart(3, '0')}`,
                    email: withLogin ? `parent@${domain}` : `${pick(PARENT_FIRST_F, i).toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
                    occupation: pick(['Engineer', 'Nurse', 'Accountant', 'Teacher', 'Pharmacist', 'Architect'], i),
                    relation: 'MOTHER',
                    isPrimary: true,
                    createLogin: withLogin,
                  },
                  {
                    firstName: pick(PARENT_FIRST_M, i),
                    lastName,
                    phone: `+1-555-2${String(i).padStart(3, '0')}`,
                    occupation: pick(['Doctor', 'Chef', 'Lawyer', 'Electrician', 'Designer', 'Pilot'], i),
                    relation: 'FATHER',
                    isPrimary: false,
                    createLogin: false,
                  },
                ],
          },
          actor,
        );
        if (withLogin) parentLoginEmail = `parent@${domain}`;
        const mother = student.guardians.find((g) => g.relation === 'MOTHER');
        previous = mother ? { guardianId: String((mother.guardianId as { _id: unknown })._id), lastName } : null;
      }

      // ── Office & leadership ──
      const roles = await RoleModel.find({ schoolId: school.schoolId }).lean();
      const roleId = (name: Role) => String(roles.find((r) => r.name === name)!._id);
      const staff = [
        { firstName: 'Patricia', lastName: 'Owens', email: `principal@${domain}`, role: Role.PRINCIPAL },
        { firstName: 'Ravi', lastName: 'Menon', email: `accountant@${domain}`, role: Role.ACCOUNTANT },
      ];
      for (const person of staff) {
        const user = await User.findOne({ email: person.email }).select('_id').lean();
        const member = user ? await SchoolMembership.exists({ userId: user._id, deletedAt: null }) : null;
        if (member) continue;
        seededSomething = true;
        const { role, ...details } = person;
        await inviteMember({ ...details, roleIds: [roleId(role)] }, roleActor);
      }

      // ── Store room ──
      const itemIds = new Map<string, string>();
      const hasInventory = (await InventoryCategory.countDocuments({ deletedAt: null })) > 0;
      for (const group of hasInventory ? [] : INVENTORY) {
        seededSomething = true;
        const category = await createCategory({ name: group.category }, actor);
        for (const item of group.items) {
          const created = await createItem(
            {
              name: item.name,
              categoryId: String(category._id),
              unit: item.unit as never,
              reorderLevel: item.reorder,
              unitCostMinor: item.cost,
              location: item.location,
              openingQuantity: item.qty,
            },
            actor,
          );
          itemIds.set(item.name, String(created._id));
        }
      }
      const move = async (name: string, input: Parameters<typeof recordMovement>[1]) => {
        const id = itemIds.get(name);
        if (id) await recordMovement(id, input, actor);
      };
      await move('Whiteboard marker', { type: 'ISSUE', quantity: 10, party: 'Grade 5-A' });
      await move('Glass beaker 250ml', { type: 'WRITE_OFF', quantity: 4, note: 'Broken during Grade 6 practical' });
      await move('Laptop (student)', { type: 'ISSUE', quantity: 20, party: 'Computer lab — Grade 6' });
      await move('Laptop (student)', { type: 'RETURN', quantity: 18, party: 'Computer lab — Grade 6' });
      await move('A4 paper', { type: 'ISSUE', quantity: 40, party: 'Exams office', reference: 'REQ-0142' });
      await move('A4 paper', { type: 'RECEIVE', quantity: 50, party: 'Office Supplies Co.', reference: 'INV-88213', unitCostMinor: 525 });
      await move('Cricket kit', { type: 'ISSUE', quantity: 3, party: 'Sports dept — inter-school match' });
      await move('Skipping rope', { type: 'ADJUST', quantity: -2, note: 'Annual stock count' });

      // ── Who teaches what where: every subject in every section, shared round-robin among qualified teachers ──
      if (await seedTeachingAssignments(actor)) seededSomething = true;

      // ── School calendar: a couple of closures so attendance has days off to show ──
      if ((await Holiday.countDocuments({ deletedAt: null })) === 0) {
        seededSomething = true;
        await createHoliday({ name: 'Winter break', startDate: '2026-12-21', endDate: '2027-01-01' }, actor);
        await createHoliday({ name: 'Founders Day', startDate: '2026-11-09' }, actor);
      }

      // ── Fees, payroll and the expense ledger (after staff exist, so they're on payroll) ──
      if (await seedFinanceData(actor)) seededSomething = true;

      // ── Exams: a published mid-term and a unit test mid-way through marks entry ──
      if (await seedExamData(actor)) seededSomething = true;

      // ── Known passwords for the demo accounts ──
      const logins: DemoLogin[] = [
        { role: 'Principal', email: `principal@${domain}`, password: 'Principal@12345' },
        { role: 'Accountant', email: `accountant@${domain}`, password: 'Accountant@12345' },
        {
          role: 'Teacher',
          email: `${TEACHERS[0]!.first}.${TEACHERS[0]!.last}@${domain}`.toLowerCase(),
          password: 'Teacher@12345',
        },
        ...(parentLoginEmail ? [{ role: 'Parent (mobile)', email: parentLoginEmail, password: 'Parent@12345' }] : []),
      ];
      for (const login of logins) await setKnownPassword(login.email, login.password);

      return { seeded: seededSomething, logins };
    },
  );
}
