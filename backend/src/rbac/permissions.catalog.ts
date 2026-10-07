import { Permission } from '@sms/shared';
import { ROLE_TEMPLATES, SCHOOL_DEFAULT_ROLES } from './roleTemplates';

/**
 * Single source of truth for what a permission code means and which module
 * it belongs to. Seeded into the Permission collection on boot (see
 * ensurePermissionCatalog below) so admin UIs can list/describe permissions
 * without a code change — CLAUDE.md: "permissions in DB, not hard-coded."
 */
export interface PermissionCatalogEntry {
  code: string;
  module: string;
  description: string;
}

function module(code: string): string {
  return code.split('.')[0] as string;
}

const DESCRIPTIONS: Partial<Record<Permission, string>> = {
  [Permission.REGISTRATION_READ]: 'View school registration applications',
  [Permission.REGISTRATION_REVIEW]: 'Mark a registration as under review',
  [Permission.REGISTRATION_APPROVE]: 'Approve a registration and provision the school',
  [Permission.REGISTRATION_REJECT]: 'Reject a registration application',
  [Permission.PLAN_MANAGE]: 'Create/update the subscription plan catalogue',
  [Permission.SCHOOL_STATUS_UPDATE]: "Suspend or reactivate a school's account",
  [Permission.SESSION_CREATE]: 'Create an academic session (school year)',
  [Permission.SESSION_READ]: 'View academic sessions',
  [Permission.SESSION_UPDATE]: 'Edit an academic session or set the current one',
  [Permission.SESSION_DELETE]: 'Archive an academic session',
  [Permission.STUDENT_CREATE]: 'Admit a student and record their guardians',
  [Permission.STUDENT_READ]: 'View students and guardians',
  [Permission.STUDENT_UPDATE]: "Edit a student's details, guardians, class or status",
  [Permission.STUDENT_DELETE]: 'Archive a student record',
  [Permission.TEACHER_CREATE]: 'Add a teacher and give them a sign-in',
  [Permission.TEACHER_READ]: 'View teachers',
  [Permission.TEACHER_UPDATE]: "Edit a teacher's details, subjects or status",
  [Permission.TEACHER_DELETE]: "Archive a teacher and end their school access",
  [Permission.CLASS_CREATE]: 'Create classes, sections and subjects',
  [Permission.CLASS_READ]: 'View classes, sections and subjects',
  [Permission.CLASS_UPDATE]: 'Edit classes, sections and subjects',
  [Permission.CLASS_DELETE]: 'Archive classes, sections and subjects',
  [Permission.ATTENDANCE_MARK]: 'Mark today’s register for sections you teach',
  [Permission.ATTENDANCE_READ]: 'View attendance registers and reports',
  [Permission.STAFF_ATTENDANCE_READ]: 'View the staff register and monthly staff attendance',
  [Permission.STAFF_ATTENDANCE_MARK]: 'Take or correct the daily staff register',
  [Permission.ATTENDANCE_MANAGE]: 'Mark or correct any section’s register, on any day',
  [Permission.EXAM_CREATE]: 'Set up exams, papers and date sheets',
  [Permission.EXAM_READ]: 'View exams, date sheets and results',
  [Permission.EXAM_MARKS_ENTER]: 'Enter marks for their own subjects',
  [Permission.EXAM_MARKS_PUBLISH]: 'Enter marks for any paper and publish or withdraw results',
  [Permission.NOTICE_CREATE]: 'Post notices',
  [Permission.NOTICE_READ]: 'Read notices',
  [Permission.INVENTORY_READ]: 'View inventory items, stock levels and movements',
  [Permission.INVENTORY_MANAGE]: 'Create, edit and archive inventory items and categories',
  [Permission.INVENTORY_STOCK_RECORD]: 'Record stock received, issued, returned or adjusted',
  [Permission.FEE_INVOICE_CREATE]: 'Generate fee invoices for a class or student',
  [Permission.FEE_INVOICE_READ]: 'View fee invoices and payments',
  [Permission.FEE_PAYMENT_RECORD]: 'Collect fee payments and issue receipts',
  [Permission.FEE_STRUCTURE_MANAGE]: 'Set up fee heads, class fee structures and late fines',
  [Permission.FEE_CONCESSION_MANAGE]: 'Grant discounts, scholarships and sibling concessions',
  [Permission.FEE_INVOICE_ADJUST]: 'Discount, fine or cancel an individual invoice',
  [Permission.FEE_PAYMENT_REFUND]: 'Refund or reverse a fee payment',
  [Permission.FEE_REPORT_READ]: 'View defaulters and collection reports, send reminders',
  [Permission.PAYROLL_READ]: 'View salary structures, payroll runs and payslips',
  [Permission.PAYROLL_MANAGE]: 'Set salaries, allowances, deductions and staff advances',
  [Permission.PAYROLL_RUN]: 'Run, lock and publish monthly payroll',
  [Permission.PAYSLIP_SELF_READ]: 'View your own payslips',
  [Permission.FINANCE_READ]: 'View school expenses, other income and the finance summary',
  [Permission.FINANCE_RECORD]: 'Record expenses and other income',
  [Permission.FINANCE_MANAGE]: 'Manage finance categories and void ledger entries',
  [Permission.SCHOOL_READ]: "View the school's profile and settings",
  [Permission.SCHOOL_UPDATE]: "Change the school's profile and settings",
  [Permission.USER_CREATE]: 'Invite a staff member to the school',
  [Permission.USER_READ]: "View the school's staff accounts",
  [Permission.USER_UPDATE]: "Enable or disable a staff member's access",
  [Permission.ROLE_ASSIGN]: "Change which roles a staff member holds",
  [Permission.ROLE_MANAGE]: 'Create, edit and delete custom roles and choose their modules',
  [Permission.AUDIT_LOG_READ]: "View the school's audit log",
};

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = Object.values(Permission).map((code) => ({
  code,
  module: module(code),
  description: DESCRIPTIONS[code] ?? code,
}));

/** The name a school sees for each module when it builds a custom role. */
export const MODULE_LABELS: Record<string, string> = {
  session: 'Academic sessions',
  student: 'Students & guardians',
  teacher: 'Teachers',
  class: 'Classes & subjects',
  attendance: 'Attendance',
  staff: 'Staff attendance',
  exam: 'Exams & results',
  fee: 'Fees',
  payroll: 'Payroll',
  payslip: 'Own payslips',
  finance: 'Finance',
  inventory: 'Inventory',
  notice: 'Notices',
  school: 'School settings',
  user: 'Staff accounts',
  role: 'Roles',
  audit: 'Audit log',
};

/**
 * What a school may put in a custom role: every permission some default
 * school role holds. That excludes the platform-only ones (registrations,
 * plans, suspending schools), which a custom role must never carry however
 * it was built. The caller's own permissions narrow this further.
 */
export const SCHOOL_ASSIGNABLE_PERMISSIONS: ReadonlySet<string> = new Set(
  SCHOOL_DEFAULT_ROLES.flatMap((role) => ROLE_TEMPLATES[role]),
);
