import { Types, type ClientSession } from 'mongoose';
import { Role } from '@sms/shared';
import { SalaryComponent, type SalaryComponentDoc } from '../../models/SalaryComponent';
import { SalaryStructure } from '../../models/SalaryStructure';
import { SalaryAdvance } from '../../models/SalaryAdvance';
import { PayrollRun } from '../../models/PayrollRun';
import { Payslip, type PayslipDoc, type PayslipLine } from '../../models/Payslip';
import { Employee, type EmployeeDoc } from '../../models/Employee';
import { SchoolMembership } from '../../models/SchoolMembership';
import { RoleModel } from '../../models/Role';
import { User } from '../../models/User';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { assertExistsInSchool, listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { withTransaction } from '../../utils/transaction';
import { unpaidDaysForMonth } from '../staff-attendance/staff-attendance.service';
import { localDateString, schoolFinanceContext } from '../../utils/school-time';
import { TenantContext } from '../../tenant/context';
import { nextSequence } from '../../services/sequence.service';
import { enqueueMail } from '../../jobs/mailer.queue';
import { postSystemExpense } from '../finance/finance.service';
import type {
  AddStaffInput,
  CreateAdvanceInput,
  CreateComponentInput,
  CreateStructureInput,
  UpdateComponentInput,
  UpdatePayslipInput,
  UpdateStructureInput,
} from './payroll.validation';

function audit(actor: ActorMeta, action: string, entity: string, entityId: Types.ObjectId | null, before: unknown, after: unknown, session?: ClientSession) {
  return recordAudit({ schoolId: actor.schoolId, actorUserId: actor.actorUserId, action, entity, entityId, before, after, ip: actor.ip, session });
}

// ─── Salary components ───────────────────────────────────────────────────────

export async function listComponents(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (search) filter.$or = [{ name: searchRegex(search) }, { code: searchRegex(search) }];
  const [items, total] = await Promise.all([
    SalaryComponent.find(filter).sort(listSort(query, ['name', 'code', 'type'], { type: 1, name: 1 })).skip(skip).limit(limit).lean(),
    SalaryComponent.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getComponent(id: string) {
  const component = await SalaryComponent.findOne({ _id: id, deletedAt: null }).lean();
  if (!component) throw AppError.notFound('Salary component not found');
  return component;
}

export async function createComponent(input: CreateComponentInput, actor: ActorMeta) {
  const clash = await SalaryComponent.findOne({ code: input.code.toUpperCase(), deletedAt: null }).lean();
  if (clash) throw AppError.conflict(`Code ${input.code.toUpperCase()} is already used by ${clash.name}`, { field: 'code' });
  const created = await SalaryComponent.create({ schoolId: actor.schoolId, ...input });
  await audit(actor, 'payroll.component.create', 'SalaryComponent', created._id, null, created.toObject());
  return getComponent(String(created._id));
}

/** Type and calculation are fixed once created — changing them would silently reinterpret every structure's values. */
export async function updateComponent(id: string, input: UpdateComponentInput, actor: ActorMeta) {
  const component = await SalaryComponent.findOne({ _id: id, deletedAt: null });
  if (!component) throw AppError.notFound('Salary component not found');
  if (input.defaultValue !== undefined && component.calculation !== 'FIXED' && input.defaultValue > 100) {
    throw AppError.badRequest('A percentage can be at most 100', { field: 'defaultValue' });
  }
  const before = component.toObject();
  component.set(input);
  await component.save();
  await audit(actor, 'payroll.component.update', 'SalaryComponent', component._id, before, component.toObject());
  return getComponent(id);
}

export async function deleteComponent(id: string, actor: ActorMeta) {
  const component = await SalaryComponent.findOne({ _id: id, deletedAt: null });
  if (!component) throw AppError.notFound('Salary component not found');
  const used = await SalaryStructure.countDocuments({ 'components.componentId': component._id, deletedAt: null });
  if (used > 0) throw AppError.conflict(`${used} salary structure${used === 1 ? ' uses' : 's use'} this component. Remove it from them first, or mark it inactive.`);
  const before = component.toObject();
  component.deletedAt = new Date();
  await component.save();
  await audit(actor, 'payroll.component.delete', 'SalaryComponent', component._id, before, component.toObject());
}

// ─── Pay computation ─────────────────────────────────────────────────────────

interface ComputeInput {
  basicMinor: number;
  components: { component: Pick<SalaryComponentDoc, 'code' | 'name' | 'type' | 'calculation'>; value: number }[];
  daysInMonth: number;
  unpaidLeaveDays: number;
  advanceRecoveries: { advanceId: Types.ObjectId; amountMinor: number }[];
  adjustments: { label: string; amountMinor: number }[];
}

/**
 * The whole payslip calculation, as a pure function so it's testable and the
 * draft review can recompute a payslip from its own stored lines.
 *   gross      = basic + Σ earnings
 *   deductions = Σ deduction components + unpaid leave (pro-rata of gross) + advance instalments
 *   net        = gross − deductions + Σ signed adjustments
 */
export function computePay(input: ComputeInput) {
  const amount = (calc: string, value: number, base: { basic: number; gross: number }) =>
    calc === 'FIXED' ? Math.round(value) : Math.round(((calc === 'PERCENT_OF_GROSS' ? base.gross : base.basic) * value) / 100);

  const earnings: PayslipLine[] = input.components
    .filter((c) => c.component.type === 'EARNING')
    .map((c) => ({ code: c.component.code, name: c.component.name, amountMinor: amount(c.component.calculation, c.value, { basic: input.basicMinor, gross: 0 }) }));
  const grossMinor = input.basicMinor + earnings.reduce((s, e) => s + e.amountMinor, 0);

  const deductions: PayslipLine[] = input.components
    .filter((c) => c.component.type === 'DEDUCTION')
    .map((c) => ({ code: c.component.code, name: c.component.name, amountMinor: amount(c.component.calculation, c.value, { basic: input.basicMinor, gross: grossMinor }) }));

  return finishPay({ ...input, earnings, deductions, grossMinor });
}

/** Totals from already-computed lines — used when only leave days or adjustments change. */
function finishPay(p: {
  basicMinor: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  grossMinor: number;
  daysInMonth: number;
  unpaidLeaveDays: number;
  advanceRecoveries: { advanceId: Types.ObjectId; amountMinor: number }[];
  adjustments: { label: string; amountMinor: number }[];
}) {
  const unpaidLeaveDeductionMinor = Math.round((p.grossMinor / p.daysInMonth) * p.unpaidLeaveDays);
  const totalDeductionsMinor =
    p.deductions.reduce((s, d) => s + d.amountMinor, 0) +
    unpaidLeaveDeductionMinor +
    p.advanceRecoveries.reduce((s, a) => s + a.amountMinor, 0);
  const netMinor = p.grossMinor - totalDeductionsMinor + p.adjustments.reduce((s, a) => s + a.amountMinor, 0);
  return { ...p, unpaidLeaveDeductionMinor, totalDeductionsMinor, netMinor };
}

function daysIn(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ─── Staff on payroll & salary structures ────────────────────────────────────

/**
 * Everyone who can be paid: Employee records (teachers get one automatically;
 * office staff are added via `addStaffToPayroll`), each with their structure
 * if set, plus staff members who have no Employee record yet.
 */
export async function listPayrollStaff(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null, status: { $ne: 'TERMINATED' } };
  if (search) {
    const rx = searchRegex(search);
    filter.$or = [{ firstName: rx }, { lastName: rx }, { employeeNumber: rx }, { designation: rx }];
  }
  const [employees, total] = await Promise.all([
    Employee.find(filter).sort({ lastName: 1, firstName: 1 }).skip(skip).limit(limit).lean(),
    Employee.countDocuments(filter),
  ]);
  const structures = await SalaryStructure.find({ employeeId: { $in: employees.map((e) => e._id) }, deletedAt: null }).lean();
  const components = await SalaryComponent.find({ deletedAt: null }).lean();
  const byId = new Map(components.map((c) => [String(c._id), c]));

  const items = employees.map((e) => {
    const s = structures.find((x) => String(x.employeeId) === String(e._id));
    const preview = s
      ? computePay({
          basicMinor: s.basicMinor,
          components: s.components
            .map((c) => ({ component: byId.get(String(c.componentId))!, value: c.value }))
            .filter((c) => c.component && c.component.isActive),
          daysInMonth: 30,
          unpaidLeaveDays: 0,
          advanceRecoveries: [],
          adjustments: [],
        })
      : null;
    return {
      ...e,
      structure: s ?? null,
      monthlyGrossMinor: preview?.grossMinor ?? null,
      monthlyNetMinor: preview?.netMinor ?? null,
    };
  });
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

/**
 * One employee's pay, for their staff profile: the live salary structure and
 * what it comes to in a month, open advances, and a year of payslips (every
 * status — payroll readers see drafts too) with that year's issued totals.
 * Payslips are the snapshots they were issued as; nothing here is recomputed
 * from them.
 */
export async function getStaffPay(employeeId: string, year: number | undefined) {
  const employee = await Employee.findOne({ _id: employeeId, deletedAt: null })
    .select('firstName lastName employeeNumber designation department joiningDate status')
    .lean();
  if (!employee) throw AppError.notFound('Staff member not found');

  const ctx = await schoolFinanceContext();
  const [structure, advances, yearRows] = await Promise.all([
    SalaryStructure.findOne({ employeeId: employee._id, deletedAt: null })
      .populate({ path: 'components.componentId', select: 'name code type calculation isActive' })
      .lean(),
    SalaryAdvance.find({ employeeId: employee._id, status: 'ACTIVE', deletedAt: null })
      .sort({ issuedAt: -1 })
      .select('amountMinor installmentMinor recoveredMinor reason issuedAt')
      .lean(),
    Payslip.aggregate<{ _id: string }>([
      { $match: { employeeId: employee._id, deletedAt: null } },
      { $group: { _id: { $substrBytes: ['$month', 0, 4] } } },
      { $sort: { _id: -1 } },
    ]),
  ]);

  const years = yearRows.map((r) => Number(r._id));
  const thisYear = Number(localDateString(new Date(), ctx.timezone).slice(0, 4));
  const shownYear = year ?? years[0] ?? thisYear;
  const payslips = await Payslip.find({
    employeeId: employee._id,
    month: { $gte: `${shownYear}-01`, $lte: `${shownYear}-12` },
    deletedAt: null,
  })
    .sort({ month: -1 })
    .select('payrollRunId month status basicMinor grossMinor totalDeductionsMinor netMinor unpaidLeaveDays')
    .lean();
  const issued = payslips.filter((p) => p.status !== 'DRAFT');

  type PopulatedComponent = Pick<SalaryComponentDoc, 'code' | 'name' | 'type' | 'calculation' | 'isActive'> & { _id: Types.ObjectId };
  const lines = (structure?.components ?? [])
    .map((c) => ({ component: c.componentId as unknown as PopulatedComponent | null, value: c.value }))
    .filter((c): c is { component: PopulatedComponent; value: number } => Boolean(c.component?.isActive));
  const monthly = structure
    ? computePay({ basicMinor: structure.basicMinor, components: lines, daysInMonth: 30, unpaidLeaveDays: 0, advanceRecoveries: [], adjustments: [] })
    : null;

  return {
    currency: ctx.currency,
    employee,
    structure: structure
      ? {
          _id: structure._id,
          effectiveFrom: structure.effectiveFrom,
          bankName: structure.bankName ?? null,
          accountTitle: structure.accountTitle ?? null,
          accountNumber: structure.accountNumber ?? null,
        }
      : null,
    /** A full month with no unpaid days or advance instalments. */
    monthly: monthly
      ? {
          basicMinor: monthly.basicMinor,
          earnings: monthly.earnings,
          deductions: monthly.deductions,
          grossMinor: monthly.grossMinor,
          totalDeductionsMinor: monthly.totalDeductionsMinor,
          netMinor: monthly.netMinor,
        }
      : null,
    advances: advances.map((a) => ({ ...a, outstandingMinor: a.amountMinor - a.recoveredMinor })),
    year: shownYear,
    /** Years with at least one payslip, newest first — the year filter's options. */
    years: years.includes(shownYear) ? years : [shownYear, ...years].sort((a, b) => b - a),
    payslips,
    /** Locked and published payslips only; a draft isn't pay yet. */
    yearTotals: {
      payslips: issued.length,
      grossMinor: issued.reduce((sum, p) => sum + p.grossMinor, 0),
      totalDeductionsMinor: issued.reduce((sum, p) => sum + p.totalDeductionsMinor, 0),
      netMinor: issued.reduce((sum, p) => sum + p.netMinor, 0),
      unpaidLeaveDays: issued.reduce((sum, p) => sum + p.unpaidLeaveDays, 0),
    },
  };
}

/** Staff memberships that aren't on payroll yet — the "add to payroll" picker. */
export async function payrollCandidates() {
  const schoolId = TenantContext.getSchoolId();
  const familyRoles = await RoleModel.find({ schoolId, name: { $in: [Role.PARENT, Role.STUDENT] } }).select('_id').lean();
  const members = await SchoolMembership.find({
    deletedAt: null,
    status: 'ACTIVE',
    roleIds: { $nin: familyRoles.map((r) => r._id) },
  })
    .populate({ path: 'userId', select: 'firstName lastName email' })
    .populate({ path: 'roleIds', select: 'name' })
    .lean();
  const employed = new Set(
    (await Employee.find({ deletedAt: null, userId: { $in: members.map((m) => (m.userId as unknown as { _id: Types.ObjectId })?._id) } }).select('userId').lean()).map((e) => String(e.userId)),
  );
  return members
    .filter((m) => m.userId && !employed.has(String((m.userId as unknown as { _id: Types.ObjectId })._id)))
    .map((m) => ({ membershipId: m._id, user: m.userId, roles: (m.roleIds as unknown as { name: string }[]).map((r) => r.name) }));
}

export async function addStaffToPayroll(input: AddStaffInput, actor: ActorMeta) {
  const membership = await SchoolMembership.findOne({ _id: input.membershipId, deletedAt: null, status: 'ACTIVE' }).lean();
  if (!membership) throw AppError.badRequest('Staff member not found', { field: 'membershipId' });
  const existing = await Employee.findOne({ userId: membership.userId, deletedAt: null }).lean();
  if (existing) throw AppError.conflict('This person is already on payroll', { field: 'membershipId' });
  const user = await User.findById(membership.userId).select('firstName lastName email phone').lean();
  if (!user) throw AppError.badRequest('Staff member not found', { field: 'membershipId' });

  const employeeId = await withTransaction(async (session) => {
    const [employee] = await Employee.create(
      [
        {
          schoolId: actor.schoolId,
          userId: user._id,
          employeeNumber: await nextSequence('employee', { prefix: 'EMP' }, session),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          designation: input.designation,
          department: input.department,
          joiningDate: input.joiningDate,
        },
      ],
      { session },
    );
    if (!employee) throw AppError.internal('Failed to add to payroll');
    await audit(actor, 'payroll.staff.add', 'Employee', employee._id, null, employee.toObject(), session);
    return String(employee._id);
  });
  return Employee.findById(employeeId).lean();
}

async function assertComponentsExist(components: { componentId: string; value: number }[]) {
  if (!components.length) return;
  const found = await SalaryComponent.find({ _id: { $in: components.map((c) => c.componentId) }, deletedAt: null }).lean();
  if (found.length !== components.length) throw AppError.badRequest('One or more salary components were not found', { field: 'components' });
  for (const c of components) {
    const comp = found.find((f) => String(f._id) === c.componentId)!;
    if (comp.calculation === 'FIXED' ? !Number.isInteger(c.value) : c.value > 100) {
      throw AppError.badRequest(`${comp.name}: ${comp.calculation === 'FIXED' ? 'use a whole minor-unit amount' : 'a percentage can be at most 100'}`, { field: 'components' });
    }
  }
}

const STRUCTURE_POPULATE = [
  { path: 'employeeId', select: 'firstName lastName employeeNumber designation department status' },
  { path: 'components.componentId', select: 'name code type calculation isActive' },
];

export async function listStructures(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePaginationQuery(query);
  const filter = { deletedAt: null };
  const [items, total] = await Promise.all([
    SalaryStructure.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate(STRUCTURE_POPULATE).lean(),
    SalaryStructure.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getStructure(id: string) {
  const structure = await SalaryStructure.findOne({ _id: id, deletedAt: null }).populate(STRUCTURE_POPULATE).lean();
  if (!structure) throw AppError.notFound('Salary structure not found');
  return structure;
}

export async function createStructure(input: CreateStructureInput, actor: ActorMeta) {
  await assertExistsInSchool(Employee, input.employeeId, 'Employee', 'employeeId');
  await assertComponentsExist(input.components);
  const existing = await SalaryStructure.findOne({ employeeId: input.employeeId, deletedAt: null }).lean();
  if (existing) throw AppError.conflict('This employee already has a salary structure — edit it instead', { field: 'employeeId' });
  const created = await SalaryStructure.create({
    schoolId: actor.schoolId,
    ...input,
    effectiveFrom: input.effectiveFrom ?? new Date(),
  });
  await audit(actor, 'payroll.structure.create', 'SalaryStructure', created._id, null, created.toObject());
  return getStructure(String(created._id));
}

export async function updateStructure(id: string, input: UpdateStructureInput, actor: ActorMeta) {
  const structure = await SalaryStructure.findOne({ _id: id, deletedAt: null });
  if (!structure) throw AppError.notFound('Salary structure not found');
  if (input.components) await assertComponentsExist(input.components);
  const before = structure.toObject();
  structure.set(input);
  await structure.save();
  await audit(actor, 'payroll.structure.update', 'SalaryStructure', structure._id, before, structure.toObject());
  return getStructure(id);
}

export async function deleteStructure(id: string, actor: ActorMeta) {
  const structure = await SalaryStructure.findOne({ _id: id, deletedAt: null });
  if (!structure) throw AppError.notFound('Salary structure not found');
  const before = structure.toObject();
  structure.deletedAt = new Date();
  await structure.save();
  await audit(actor, 'payroll.structure.delete', 'SalaryStructure', structure._id, before, structure.toObject());
}

// ─── Advances ────────────────────────────────────────────────────────────────

export async function listAdvances(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (typeof query.employeeId === 'string') filter.employeeId = query.employeeId;
  if (typeof query.status === 'string') filter.status = query.status;
  const [items, total] = await Promise.all([
    SalaryAdvance.find(filter)
      .sort({ issuedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'employeeId', select: 'firstName lastName employeeNumber' })
      .lean(),
    SalaryAdvance.countDocuments(filter),
  ]);
  return { items: items.map((a) => ({ ...a, outstandingMinor: a.amountMinor - a.recoveredMinor })), meta: buildPaginationMeta(page, limit, total) };
}

export async function getAdvance(id: string) {
  const advance = await SalaryAdvance.findOne({ _id: id, deletedAt: null })
    .populate({ path: 'employeeId', select: 'firstName lastName employeeNumber' })
    .lean();
  if (!advance) throw AppError.notFound('Advance not found');
  return { ...advance, outstandingMinor: advance.amountMinor - advance.recoveredMinor };
}

export async function createAdvance(input: CreateAdvanceInput, actor: ActorMeta) {
  await assertExistsInSchool(Employee, input.employeeId, 'Employee', 'employeeId');
  const created = await SalaryAdvance.create({ schoolId: actor.schoolId, ...input, issuedAt: input.issuedAt ?? new Date() });
  await audit(actor, 'payroll.advance.create', 'SalaryAdvance', created._id, null, created.toObject());
  return getAdvance(String(created._id));
}

/** Stops further recovery. Amounts already recovered stay recovered. */
export async function cancelAdvance(id: string, actor: ActorMeta) {
  const advance = await SalaryAdvance.findOne({ _id: id, deletedAt: null });
  if (!advance) throw AppError.notFound('Advance not found');
  if (advance.status !== 'ACTIVE') throw AppError.conflict('Only an active advance can be cancelled');
  const before = advance.toObject();
  advance.status = 'CANCELLED';
  await advance.save();
  await audit(actor, 'payroll.advance.cancel', 'SalaryAdvance', advance._id, before, advance.toObject());
  return getAdvance(id);
}

// ─── Payroll runs ────────────────────────────────────────────────────────────

type KeptPayslip = Pick<PayslipDoc, 'unpaidLeaveDays' | 'adjustments' | 'attendanceUnpaidDays' | 'unpaidLeaveOverridden'>;

/**
 * Builds this month's draft payslips — preserving adjustments already entered
 * for the same employee. Unpaid days come from the staff register unless
 * someone set them by hand, in which case their number is kept. (A payslip
 * from before the register fed payroll counts as hand-set if it differs from
 * zero, so nothing already entered is lost.)
 */
async function buildPayslips(
  runId: Types.ObjectId,
  month: string,
  keep: Map<string, KeptPayslip>,
  session: ClientSession,
) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  const days = daysIn(month);

  const employees = await Employee.find({ deletedAt: null, status: { $in: ['ACTIVE', 'ON_LEAVE'] }, joiningDate: { $lte: monthEnd } })
    .session(session)
    .lean();
  const structures = await SalaryStructure.find({ employeeId: { $in: employees.map((e) => e._id) }, deletedAt: null }).session(session).lean();
  const components = await SalaryComponent.find({ deletedAt: null, isActive: true }).session(session).lean();
  const advances = await SalaryAdvance.find({ employeeId: { $in: employees.map((e) => e._id) }, status: 'ACTIVE', deletedAt: null })
    .session(session)
    .lean();
  const byComponent = new Map(components.map((c) => [String(c._id), c]));
  const attendanceUnpaid = await unpaidDaysForMonth(month, session);

  const missing: Pick<EmployeeDoc, '_id' | 'firstName' | 'lastName' | 'employeeNumber'>[] = [];
  const docs = [];
  for (const e of employees) {
    const s = structures.find((x) => String(x.employeeId) === String(e._id));
    if (!s) {
      missing.push({ _id: e._id, firstName: e.firstName, lastName: e.lastName, employeeNumber: e.employeeNumber });
      continue;
    }
    const kept = keep.get(String(e._id));
    const fromAttendance = Math.min(attendanceUnpaid.get(String(e._id)) ?? 0, days);
    const overridden = kept ? (kept.unpaidLeaveOverridden ?? kept.unpaidLeaveDays !== (kept.attendanceUnpaidDays ?? 0)) : false;
    const recoveries = advances
      .filter((a) => String(a.employeeId) === String(e._id))
      .map((a) => ({ advanceId: a._id, amountMinor: Math.min(a.installmentMinor, a.amountMinor - a.recoveredMinor) }))
      .filter((r) => r.amountMinor > 0);
    const pay = computePay({
      basicMinor: s.basicMinor,
      components: s.components
        .map((c) => ({ component: byComponent.get(String(c.componentId))!, value: c.value }))
        .filter((c) => c.component),
      daysInMonth: days,
      unpaidLeaveDays: overridden ? Math.min(kept!.unpaidLeaveDays, days) : fromAttendance,
      advanceRecoveries: recoveries,
      adjustments: kept?.adjustments ?? [],
    });
    docs.push({
      payrollRunId: runId,
      employeeId: e._id,
      userId: e.userId,
      month,
      status: 'DRAFT',
      employee: { name: `${e.firstName} ${e.lastName}`, employeeNumber: e.employeeNumber, designation: e.designation, department: e.department },
      bank: { bankName: s.bankName, accountTitle: s.accountTitle, accountNumber: s.accountNumber },
      attendanceUnpaidDays: fromAttendance,
      unpaidLeaveOverridden: overridden,
      ...pay,
    });
  }
  if (docs.length) await Payslip.insertMany(docs, { session });
  return { count: docs.length, missing };
}

async function refreshRunTotals(runId: Types.ObjectId, session: ClientSession) {
  const [t] = await Payslip.aggregate<{ count: number; gross: number; deductions: number; net: number }>([
    { $match: { payrollRunId: runId, deletedAt: null } },
    { $group: { _id: null, count: { $sum: 1 }, gross: { $sum: '$grossMinor' }, deductions: { $sum: '$totalDeductionsMinor' }, net: { $sum: '$netMinor' } } },
  ]).session(session);
  await PayrollRun.updateOne(
    { _id: runId },
    { $set: { employeeCount: t?.count ?? 0, grossMinor: t?.gross ?? 0, deductionsMinor: t?.deductions ?? 0, netMinor: t?.net ?? 0 } },
    { session },
  );
}

export async function listRuns(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePaginationQuery(query);
  const filter = { deletedAt: null };
  const [items, total] = await Promise.all([
    PayrollRun.find(filter).sort({ month: -1 }).skip(skip).limit(limit).lean(),
    PayrollRun.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getRun(id: string) {
  const run = await PayrollRun.findOne({ _id: id, deletedAt: null })
    .populate([
      { path: 'lockedByUserId', select: 'firstName lastName' },
      { path: 'publishedByUserId', select: 'firstName lastName' },
    ])
    .lean();
  if (!run) throw AppError.notFound('Payroll run not found');
  const payslips = await Payslip.find({ payrollRunId: run._id, deletedAt: null }).sort({ 'employee.name': 1 }).lean();
  const ctx = await schoolFinanceContext();
  return { ...run, payslips, currency: ctx.currency };
}

export async function createRun(month: string, notes: string | undefined, actor: ActorMeta) {
  const existing = await PayrollRun.findOne({ month, deletedAt: null }).lean();
  if (existing) throw AppError.conflict(`There's already a payroll run for ${month}`, { field: 'month' });

  try {
    const { runId, missing } = await withTransaction(async (session) => {
      const [run] = await PayrollRun.create([{ schoolId: actor.schoolId, month, notes, createdByUserId: actor.actorUserId }], { session });
      if (!run) throw AppError.internal('Failed to create the run');
      const built = await buildPayslips(run._id, month, new Map(), session);
      if (built.count === 0) {
        throw AppError.badRequest('Nobody to pay: add salary structures for your staff first', {
          missing: built.missing.map((e) => `${e.firstName} ${e.lastName}`),
        });
      }
      await refreshRunTotals(run._id, session);
      await audit(actor, 'payroll.run.create', 'PayrollRun', run._id, null, { month, payslips: built.count }, session);
      return { runId: String(run._id), missing: built.missing };
    });
    return { ...(await getRun(runId)), missingStructures: missing };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw AppError.conflict(`There's already a payroll run for ${month}`, { field: 'month' });
    throw err;
  }
}

/** DRAFT only: rebuild every payslip from current structures and the staff register, keeping hand-set leave days and adjustments. */
export async function recalculateRun(id: string, actor: ActorMeta) {
  const run = await PayrollRun.findOne({ _id: id, deletedAt: null }).lean();
  if (!run) throw AppError.notFound('Payroll run not found');
  if (run.status !== 'DRAFT') throw AppError.conflict('Only a draft run can be recalculated');

  const missing = await withTransaction(async (session) => {
    const current = await Payslip.find({ payrollRunId: run._id, deletedAt: null }).session(session).lean();
    const keep = new Map<string, KeptPayslip>(
      current.map((p) => [
        String(p.employeeId),
        {
          unpaidLeaveDays: p.unpaidLeaveDays,
          adjustments: p.adjustments,
          attendanceUnpaidDays: p.attendanceUnpaidDays,
          unpaidLeaveOverridden: p.unpaidLeaveOverridden,
        },
      ]),
    );
    await Payslip.updateMany({ payrollRunId: run._id, deletedAt: null }, { $set: { deletedAt: new Date() } }, { session });
    const built = await buildPayslips(run._id, run.month, keep, session);
    await refreshRunTotals(run._id, session);
    await audit(actor, 'payroll.run.recalculate', 'PayrollRun', run._id, { payslips: current.length }, { payslips: built.count }, session);
    return built.missing;
  });
  return { ...(await getRun(id)), missingStructures: missing };
}

/** DRAFT only: change one payslip's unpaid leave days or adjustments, then re-total it. */
export async function updatePayslip(id: string, input: UpdatePayslipInput, actor: ActorMeta) {
  const slip = await Payslip.findOne({ _id: id, deletedAt: null }).lean();
  if (!slip) throw AppError.notFound('Payslip not found');
  if (slip.status !== 'DRAFT') throw AppError.conflict('This payroll run is locked — payslips can no longer change');
  if (input.unpaidLeaveDays !== undefined && input.unpaidLeaveDays > slip.daysInMonth) {
    throw AppError.badRequest(`At most ${slip.daysInMonth} days in ${slip.month}`, { field: 'unpaidLeaveDays' });
  }
  const next = finishPay({
    basicMinor: slip.basicMinor,
    earnings: slip.earnings,
    deductions: slip.deductions,
    grossMinor: slip.grossMinor,
    daysInMonth: slip.daysInMonth,
    unpaidLeaveDays: input.unpaidLeaveDays ?? slip.unpaidLeaveDays,
    advanceRecoveries: slip.advanceRecoveries,
    adjustments: input.adjustments ?? slip.adjustments,
  });

  await withTransaction(async (session) => {
    const res = await Payslip.updateOne(
      { _id: slip._id, status: 'DRAFT' },
      {
        $set: {
          unpaidLeaveDays: next.unpaidLeaveDays,
          unpaidLeaveDeductionMinor: next.unpaidLeaveDeductionMinor,
          // Setting the days back to what the register says hands them back to the register.
          ...(input.unpaidLeaveDays !== undefined
            ? { unpaidLeaveOverridden: input.unpaidLeaveDays !== (slip.attendanceUnpaidDays ?? 0) }
            : {}),
          adjustments: next.adjustments,
          totalDeductionsMinor: next.totalDeductionsMinor,
          netMinor: next.netMinor,
        },
      },
      { session },
    );
    if (res.modifiedCount === 0 && res.matchedCount === 0) throw AppError.conflict('This payroll run was locked meanwhile');
    await refreshRunTotals(slip.payrollRunId, session);
    await audit(actor, 'payroll.payslip.update', 'Payslip', slip._id,
      { unpaidLeaveDays: slip.unpaidLeaveDays, adjustments: slip.adjustments, netMinor: slip.netMinor },
      { unpaidLeaveDays: next.unpaidLeaveDays, adjustments: next.adjustments, netMinor: next.netMinor }, session);
  });
  return getPayslip(id);
}

/**
 * Freezes the month: no more edits, and each advance instalment is booked as
 * recovered (closing advances that are paid off) — all in one transaction.
 */
export async function lockRun(id: string, actor: ActorMeta) {
  const run = await PayrollRun.findOne({ _id: id, deletedAt: null }).lean();
  if (!run) throw AppError.notFound('Payroll run not found');
  if (run.status !== 'DRAFT') throw AppError.conflict('This run is already locked');
  const negative = await Payslip.find({ payrollRunId: run._id, deletedAt: null, netMinor: { $lt: 0 } }).select('employee.name').lean();
  if (negative.length) {
    throw AppError.badRequest(`Net pay is negative for ${negative.map((p) => p.employee.name).join(', ')} — review their deductions`);
  }

  await withTransaction(async (session) => {
    const res = await PayrollRun.updateOne(
      { _id: run._id, status: 'DRAFT' },
      { $set: { status: 'LOCKED', lockedAt: new Date(), lockedByUserId: actor.actorUserId } },
      { session },
    );
    if (res.modifiedCount === 0) throw AppError.conflict('This run changed meanwhile — reload');
    await Payslip.updateMany({ payrollRunId: run._id, deletedAt: null }, { $set: { status: 'LOCKED' } }, { session });

    const slips = await Payslip.find({ payrollRunId: run._id, deletedAt: null }).select('advanceRecoveries').session(session).lean();
    const touched: Types.ObjectId[] = [];
    for (const r of slips.flatMap((s) => s.advanceRecoveries)) {
      // Guarded like every money $inc: the instalment was worked out when the
      // draft was built, and another month's run (or a cancellation) may have
      // settled the advance since. Recovering it again would take more from
      // the employee than they borrowed; instead the lock fails, rolls back,
      // and a recalculation picks up the advance's real balance.
      const recovered = await SalaryAdvance.updateOne(
        { _id: r.advanceId, status: 'ACTIVE', $expr: { $lte: [{ $add: ['$recoveredMinor', r.amountMinor] }, '$amountMinor'] } },
        { $inc: { recoveredMinor: r.amountMinor } },
        { session },
      );
      if (recovered.modifiedCount === 0) {
        throw AppError.conflict(
          'A salary advance on this run was already recovered or cancelled since the run was built — recalculate the run, then lock it',
        );
      }
      touched.push(r.advanceId);
    }
    if (touched.length) {
      await SalaryAdvance.updateMany(
        { _id: { $in: touched }, status: 'ACTIVE', $expr: { $gte: ['$recoveredMinor', '$amountMinor'] } },
        { $set: { status: 'CLOSED' } },
        { session },
      );
    }
    await audit(actor, 'payroll.run.lock', 'PayrollRun', run._id, { status: 'DRAFT' }, { status: 'LOCKED', advancesRecovered: touched.length }, session);
  });
  return getRun(id);
}

/**
 * Pays out: staff can now see their payslips, the month's salary cost is
 * posted to the finance ledger as one expense, and staff are emailed.
 */
export async function publishRun(id: string, actor: ActorMeta) {
  const run = await PayrollRun.findOne({ _id: id, deletedAt: null }).lean();
  if (!run) throw AppError.notFound('Payroll run not found');
  if (run.status !== 'LOCKED') throw AppError.conflict(run.status === 'DRAFT' ? 'Lock the run before publishing it' : 'This run is already published');

  await withTransaction(async (session) => {
    const res = await PayrollRun.updateOne(
      { _id: run._id, status: 'LOCKED' },
      { $set: { status: 'PUBLISHED', publishedAt: new Date(), publishedByUserId: actor.actorUserId } },
      { session },
    );
    if (res.modifiedCount === 0) throw AppError.conflict('This run changed meanwhile — reload');
    await Payslip.updateMany({ payrollRunId: run._id, deletedAt: null }, { $set: { status: 'PUBLISHED' } }, { session });
    if (run.netMinor > 0) {
      await postSystemExpense(
        {
          categoryName: 'Salaries',
          amountMinor: run.netMinor,
          date: new Date(),
          description: `Salaries — ${run.month} (${run.employeeCount} staff)`,
          method: 'BANK_TRANSFER',
          source: 'PAYROLL',
          sourceId: run._id,
        },
        actor,
        session,
      );
    }
    await audit(actor, 'payroll.run.publish', 'PayrollRun', run._id, { status: 'LOCKED' }, { status: 'PUBLISHED', netMinor: run.netMinor }, session);
  });

  // After commit: tell staff their payslip is ready.
  const slips = await Payslip.find({ payrollRunId: run._id, deletedAt: null }).select('userId month').lean();
  const users = await User.find({ _id: { $in: slips.map((s) => s.userId) } }).select('email firstName').lean();
  for (const u of users) {
    await enqueueMail({ to: u.email, subject: `Your payslip for ${run.month} is ready`, body: `Hi ${u.firstName}, your payslip for ${run.month} is available in the school console under "My payslips".` });
  }
  return getRun(id);
}

/** Discards a draft run entirely. Locked and published runs are permanent. */
export async function deleteRun(id: string, actor: ActorMeta) {
  const run = await PayrollRun.findOne({ _id: id, deletedAt: null }).lean();
  if (!run) throw AppError.notFound('Payroll run not found');
  if (run.status !== 'DRAFT') throw AppError.conflict('Only a draft run can be discarded');
  await withTransaction(async (session) => {
    const now = new Date();
    await PayrollRun.updateOne({ _id: run._id, status: 'DRAFT' }, { $set: { deletedAt: now } }, { session });
    await Payslip.updateMany({ payrollRunId: run._id, deletedAt: null }, { $set: { deletedAt: now } }, { session });
    await audit(actor, 'payroll.run.delete', 'PayrollRun', run._id, { month: run.month }, { deletedAt: now }, session);
  });
}

/** Bank transfer file for a locked or published run. CSV, one line per payee. */
/**
 * Names and account titles are typed in by staff; one starting with = + - @
 * (or a tab/CR) would run as a formula when the file is opened in a
 * spreadsheet. A leading apostrophe makes it plain text. Amounts are always
 * positive, so they're never touched.
 */
export function neutraliseFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export async function bankExport(id: string): Promise<{ filename: string; csv: string }> {
  const run = await PayrollRun.findOne({ _id: id, deletedAt: null }).lean();
  if (!run) throw AppError.notFound('Payroll run not found');
  if (run.status === 'DRAFT') throw AppError.conflict('Lock the run before exporting the bank file');
  const slips = await Payslip.find({ payrollRunId: run._id, deletedAt: null, netMinor: { $gt: 0 } }).sort({ 'employee.name': 1 }).lean();
  const cell = (v: unknown) => `"${neutraliseFormula(String(v ?? '')).replace(/"/g, '""')}"`;
  const lines = [
    ['Employee No', 'Name', 'Bank', 'Account title', 'Account number', 'Amount', 'Reference'].map(cell).join(','),
    ...slips.map((s) =>
      [s.employee.employeeNumber, s.employee.name, s.bank?.bankName, s.bank?.accountTitle, s.bank?.accountNumber, (s.netMinor / 100).toFixed(2), `Salary ${run.month}`]
        .map(cell)
        .join(','),
    ),
  ];
  return { filename: `payroll-${run.month}.csv`, csv: `${lines.join('\r\n')}\r\n` };
}

// ─── Payslips ────────────────────────────────────────────────────────────────

export async function getPayslip(id: string) {
  const slip = await Payslip.findOne({ _id: id, deletedAt: null }).lean();
  if (!slip) throw AppError.notFound('Payslip not found');
  const ctx = await schoolFinanceContext();
  return { ...slip, currency: ctx.currency, schoolName: ctx.name };
}

/** A staff member's own published payslips — scoped to their user id, never to anyone else's. */
export async function listMyPayslips(userId: string, query: Record<string, unknown>) {
  const { page, limit, skip } = parsePaginationQuery(query);
  const filter = { userId, status: 'PUBLISHED', deletedAt: null };
  const [items, total] = await Promise.all([
    Payslip.find(filter).sort({ month: -1 }).skip(skip).limit(limit).select('month netMinor grossMinor totalDeductionsMinor employee status').lean(),
    Payslip.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getMyPayslip(userId: string, id: string) {
  const slip = await Payslip.findOne({ _id: id, userId, status: 'PUBLISHED', deletedAt: null }).lean();
  if (!slip) throw AppError.notFound('Payslip not found');
  const ctx = await schoolFinanceContext();
  return { ...slip, currency: ctx.currency, schoolName: ctx.name };
}
