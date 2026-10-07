import { Class } from '../models/Class';
import { Student } from '../models/Student';
import { Employee } from '../models/Employee';
import { FeeHead } from '../models/FeeHead';
import { FeeConcession } from '../models/FeeConcession';
import { FeeInvoice } from '../models/FeeInvoice';
import { FeePayment } from '../models/FeePayment';
import { SalaryComponent } from '../models/SalaryComponent';
import { SalaryStructure } from '../models/SalaryStructure';
import { PayrollRun } from '../models/PayrollRun';
import { FinanceCategory } from '../models/FinanceCategory';
import { AcademicSession } from '../models/AcademicSession';
import type { ActorMeta } from '../utils/actor';
import type { PaymentMethod } from '../models/FeePayment';
import { createConcession, createFeeHead, createFeeStructure, updateFeeSettings } from '../modules/fees/fee-setup.service';
import { generateInvoices } from '../modules/fees/invoices.service';
import { recordPayment } from '../modules/fees/payments.service';
import {
  addStaffToPayroll,
  createAdvance,
  createComponent,
  createRun,
  createStructure,
  lockRun,
  payrollCandidates,
  publishRun,
} from '../modules/payroll/payroll.service';
import { createCategory, createEntry } from '../modules/finance/finance.service';

/**
 * Money for the demo school: fee setup, last month's and this month's
 * invoices with a realistic mix of paid, part-paid and overdue, a published
 * payroll for last month and a draft for this one, and a few months of
 * expenses and other income. Like the rest of the seed it goes through the
 * real services, and each stage skips itself if its data already exists.
 *
 * Must run inside the school's tenant context (seedSchoolData provides it).
 * All amounts are minor units (cents for the USD demo schools).
 */

const DAY = 86_400_000;
const pick = <T>(list: T[], i: number): T => list[i % list.length] as T;

/** "YYYY-MM" `offset` months from today (UTC; close enough for demo data). */
function monthKey(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
}
const monthName = (key: string) =>
  new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
const dayOf = (key: string, day: number) => new Date(`${key}-${String(day).padStart(2, '0')}T00:00:00.000Z`);

export async function seedFinanceData(actor: ActorMeta): Promise<boolean> {
  let seeded = false;
  const session = await AcademicSession.findOne({ isCurrent: true, deletedAt: null }).select('_id').lean();
  if (!session) return false;

  // ── Fee heads, class structures, rules ──
  if ((await FeeHead.countDocuments({ deletedAt: null })) === 0) {
    seeded = true;
    const tuition = await createFeeHead({ name: 'Tuition', code: 'TUI', frequency: 'MONTHLY' }, actor);
    const lab = await createFeeHead({ name: 'Computer lab', code: 'LAB', frequency: 'MONTHLY' }, actor);
    const exam = await createFeeHead({ name: 'Exam fee', code: 'EXM', frequency: 'ANNUAL' }, actor);
    await createFeeHead({ name: 'Admission', code: 'ADM', frequency: 'ONE_TIME', description: 'Charged once, on admission' }, actor);
    await updateFeeSettings({ lateFineType: 'PER_DAY', lateFineAmountMinor: 100, graceDays: 5, maxFineMinor: 3000 }, actor);

    const classes = await Class.find({ academicSessionId: session._id, deletedAt: null }).sort({ order: 1 }).lean();
    for (const cls of classes) {
      const order = cls.order ?? 1;
      await createFeeStructure(
        {
          name: `${cls.name} fees`,
          classId: String(cls._id),
          items: [
            { feeHeadId: String(tuition._id), amountMinor: 40000 + order * 2500 },
            { feeHeadId: String(lab._id), amountMinor: order >= 4 ? 2500 : 1500 },
            { feeHeadId: String(exam._id), amountMinor: 4000 },
          ],
        },
        actor,
      );
    }
  }

  // ── Concessions: a scholarship and two sibling discounts ──
  const students = await Student.find({ status: 'ACTIVE', deletedAt: null }).sort({ createdAt: 1 }).select('_id').lean();
  if ((await FeeConcession.countDocuments({ deletedAt: null })) === 0 && students.length >= 6) {
    seeded = true;
    const tuition = await FeeHead.findOne({ code: 'TUI', deletedAt: null }).select('_id').lean();
    await createConcession(
      { studentId: String(students[2]!._id), name: 'Merit scholarship', kind: 'SCHOLARSHIP', type: 'PERCENT', value: 50, feeHeadId: tuition ? String(tuition._id) : null, isActive: true },
      actor,
    );
    for (const s of [students[4]!, students[5]!]) {
      await createConcession({ studentId: String(s._id), name: 'Sibling discount', kind: 'SIBLING', type: 'PERCENT', value: 10, feeHeadId: null, isActive: true }, actor);
    }
  }

  // ── Invoices: last month (now overdue for some) and this month ──
  const prev = monthKey(-1);
  const current = monthKey(0);
  const classIds = (await Class.find({ academicSessionId: session._id, deletedAt: null }).select('_id').lean()).map((c) => String(c._id));
  const monthlyHeads = (await FeeHead.find({ frequency: 'MONTHLY', deletedAt: null }).select('_id').lean()).map((h) => String(h._id));
  const examHead = await FeeHead.findOne({ code: 'EXM', deletedAt: null }).select('_id').lean();
  for (const [key, heads] of [
    [prev, examHead ? [...monthlyHeads, String(examHead._id)] : monthlyHeads],
    [current, monthlyHeads],
  ] as const) {
    if (classIds.length === 0 || (await FeeInvoice.countDocuments({ periodKey: key, deletedAt: null })) > 0) continue;
    seeded = true;
    await generateInvoices(
      { classIds, feeHeadIds: [...heads], periodKey: key, periodLabel: monthName(key), issueDate: dayOf(key, 1), dueDate: dayOf(key, 10) },
      actor,
    );
  }

  // ── Payments: most of last month paid, some part-paid, a few overdue; a start on this month ──
  if ((await FeePayment.countDocuments({ deletedAt: null })) === 0) {
    const methods: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'CASH', 'CARD', 'CHEQUE'];
    const now = Date.now();
    const prevInvoices = await FeeInvoice.find({ periodKey: prev, deletedAt: null }).sort({ invoiceNumber: 1 }).lean();
    for (const [i, inv] of prevInvoices.entries()) {
      const bucket = i % 10;
      if (bucket >= 8) continue; // 20% never paid → defaulters
      const amountMinor = bucket === 7 ? Math.round(inv.totalMinor / 2) : inv.totalMinor; // 10% part-paid
      seeded = true;
      await recordPayment(
        {
          studentId: String(inv.studentId),
          amountMinor,
          method: methods[i % methods.length]!,
          reference: methods[i % methods.length] === 'CASH' ? undefined : `REF-${1000 + i}`,
          paidAt: new Date(Math.min(now - DAY, dayOf(prev, 3).getTime() + (i % 12) * DAY + 9 * 3_600_000)),
          invoiceIds: [String(inv._id)],
        },
        actor,
      );
    }
    const currentInvoices = await FeeInvoice.find({ periodKey: current, deletedAt: null }).sort({ invoiceNumber: 1 }).lean();
    for (const [i, inv] of currentInvoices.entries()) {
      if (i % 3 !== 0) continue;
      seeded = true;
      await recordPayment(
        {
          studentId: String(inv.studentId),
          amountMinor: inv.totalMinor,
          method: methods[(i + 1) % methods.length]!,
          paidAt: new Date(Math.max(dayOf(current, 1).getTime() + 10 * 3_600_000, now - (i % 4) * DAY - 2 * 3_600_000)),
          invoiceIds: [String(inv._id)],
        },
        actor,
      );
    }
  }

  // ── Payroll: components, office staff on payroll, salaries, an advance ──
  if ((await SalaryComponent.countDocuments({ deletedAt: null })) === 0) {
    seeded = true;
    const hra = await createComponent({ name: 'House rent', code: 'HRA', type: 'EARNING', calculation: 'PERCENT_OF_BASIC', defaultValue: 40, isActive: true }, actor);
    const medical = await createComponent({ name: 'Medical allowance', code: 'MED', type: 'EARNING', calculation: 'FIXED', defaultValue: 10000, isActive: true }, actor);
    const pf = await createComponent({ name: 'Provident fund', code: 'PF', type: 'DEDUCTION', calculation: 'PERCENT_OF_BASIC', defaultValue: 5, isActive: true }, actor);
    const tax = await createComponent({ name: 'Income tax', code: 'TAX', type: 'DEDUCTION', calculation: 'PERCENT_OF_GROSS', defaultValue: 8, isActive: true }, actor);

    const office: Record<string, { designation: string; department: string }> = {
      PRINCIPAL: { designation: 'Principal', department: 'Leadership' },
      ACCOUNTANT: { designation: 'Accountant', department: 'Accounts' },
    };
    for (const c of await payrollCandidates()) {
      const role = c.roles.find((r) => office[r]);
      if (!role) continue;
      await addStaffToPayroll({ membershipId: String(c.membershipId), ...office[role]!, joiningDate: new Date('2024-04-01') }, actor);
    }

    const employees = await Employee.find({ deletedAt: null }).sort({ createdAt: 1 }).lean();
    for (const [i, e] of employees.entries()) {
      const basic = e.designation === 'Principal' ? 200000 : e.designation === 'Accountant' ? 100000 : 90000 + (i % 5) * 10000;
      await createStructure(
        {
          employeeId: String(e._id),
          basicMinor: basic,
          components: [
            { componentId: String(hra._id), value: 40 },
            { componentId: String(medical._id), value: 10000 },
            { componentId: String(pf._id), value: 5 },
            { componentId: String(tax._id), value: 8 },
          ],
          bankName: pick(['First National Bank', 'City Savings Bank', 'Metro Bank'], i),
          accountTitle: `${e.firstName} ${e.lastName}`,
          accountNumber: `0012${String(4410000 + i * 7331).padStart(9, '0')}`,
          effectiveFrom: new Date('2026-04-01'),
        },
        actor,
      );
    }
    const firstTeacher = employees.find((e) => e.designation !== 'Principal' && e.designation !== 'Accountant');
    if (firstTeacher) {
      await createAdvance({ employeeId: String(firstTeacher._id), amountMinor: 60000, installmentMinor: 15000, reason: 'Medical emergency', issuedAt: dayOf(prev, 2) }, actor);
    }
  }

  // Last month published (posts the salary expense), this month left as a draft to review.
  if ((await SalaryStructure.countDocuments({ deletedAt: null })) > 0) {
    if (!(await PayrollRun.exists({ month: prev, deletedAt: null }))) {
      seeded = true;
      const run = await createRun(prev, 'Regular monthly payroll', actor);
      await lockRun(String(run._id), actor);
      await publishRun(String(run._id), actor);
    }
    if (!(await PayrollRun.exists({ month: current, deletedAt: null }))) {
      seeded = true;
      await createRun(current, undefined, actor);
    }
  }

  // ── Expenses & other income ──
  if ((await FinanceCategory.countDocuments({ isSystem: false, deletedAt: null })) === 0) {
    seeded = true;
    const cat = async (name: string, type: 'EXPENSE' | 'INCOME') => String((await createCategory({ name, type }, actor))._id);
    const utilities = await cat('Utilities', 'EXPENSE');
    const maintenance = await cat('Maintenance', 'EXPENSE');
    const supplies = await cat('Supplies', 'EXPENSE');
    const events = await cat('Events', 'EXPENSE');
    const donations = await cat('Donations', 'INCOME');
    const rental = await cat('Hall rental', 'INCOME');

    const today = Date.now();
    const entries: [string, 'EXPENSE' | 'INCOME', string, number, string, number, string?][] = [];
    for (const offset of [-3, -2, -1, 0]) {
      const m = monthKey(offset);
      entries.push([utilities, 'EXPENSE', `Electricity bill — ${monthName(m)}`, 184000 + offset * 6000, m, 6, 'City Power Co.']);
      entries.push([utilities, 'EXPENSE', `Water & internet — ${monthName(m)}`, 42000, m, 8, 'Metro Utilities']);
    }
    entries.push([maintenance, 'EXPENSE', 'Roof repair, Block B', 265000, monthKey(-2), 14, 'BuildRight Contractors']);
    entries.push([maintenance, 'EXPENSE', 'Air-conditioner servicing', 78000, monthKey(-1), 19, 'CoolAir Services']);
    entries.push([supplies, 'EXPENSE', 'Printer toner and paper', 36500, monthKey(-1), 4, 'Office Supplies Co.']);
    entries.push([supplies, 'EXPENSE', 'Science lab consumables', 54000, monthKey(0), 2, 'LabWorks Ltd.']);
    entries.push([events, 'EXPENSE', 'Annual sports day', 120000, monthKey(-2), 22, 'Various vendors']);
    entries.push([donations, 'INCOME', 'Alumni donation for the library', 250000, monthKey(-2), 11, 'Alumni Association']);
    entries.push([rental, 'INCOME', 'Hall booked for community event', 60000, monthKey(-1), 16, 'Rotary Club']);
    for (const [categoryId, type, description, amountMinor, month, day, party] of entries) {
      const date = dayOf(month, day);
      if (date.getTime() > today) continue; // never record the future
      await createEntry({ type, categoryId, amountMinor, date, description, party, method: 'BANK_TRANSFER' }, actor);
    }
  }

  return seeded;
}
