import { Permission } from '@sms/shared';
import type { IconName } from '@/components/ui/icon';
import type { TileTone } from '@/components/ui/tile';

/**
 * Every staff module the app offers, gated by permission exactly like the
 * web sidebar (frontend/src/lib/navigation.ts): a person sees a module only
 * if they hold one of its permissions. Only routes that exist appear here.
 */
export interface MobileModule {
  key: string;
  title: string;
  description: string;
  icon: IconName;
  href: string;
  /** Shown when the user holds at least one of these… */
  permissions: Permission[];
  /** …and every one of these (what the module's screens need to load at all). */
  requires?: Permission[];
  group: 'Teaching' | 'Students & staff' | 'Fees' | 'Management' | 'Me';
}

export const MODULES: MobileModule[] = [
  {
    key: 'marks',
    title: 'Marks entry',
    description: 'Enter marks for your papers',
    icon: 'marks',
    href: '/modules/marks',
    permissions: [Permission.EXAM_MARKS_ENTER],
    requires: [Permission.EXAM_READ],
    group: 'Teaching',
  },
  {
    key: 'holidays',
    title: 'Holidays',
    description: 'Days off, closures and breaks',
    icon: 'calendar',
    href: '/modules/holidays',
    permissions: [Permission.ATTENDANCE_READ],
    group: 'Teaching',
  },
  {
    key: 'students',
    title: 'Students',
    description: 'Profiles, guardians, admissions',
    icon: 'student',
    href: '/modules/students',
    permissions: [Permission.STUDENT_READ],
    group: 'Students & staff',
  },
  {
    key: 'staff',
    title: 'Teachers & staff',
    description: 'Directory and contacts',
    icon: 'staff',
    href: '/modules/staff',
    permissions: [Permission.TEACHER_READ, Permission.USER_READ],
    group: 'Students & staff',
  },
  {
    key: 'staffAttendance',
    title: 'Staff attendance',
    description: "Today's staff register",
    icon: 'staffAttendance',
    href: '/modules/staff-attendance',
    permissions: [Permission.STAFF_ATTENDANCE_READ],
    group: 'Students & staff',
  },
  {
    key: 'collect',
    title: 'Collect fees',
    description: 'Take a payment, issue a receipt',
    icon: 'fees',
    href: '/modules/fees/collect',
    permissions: [Permission.FEE_PAYMENT_RECORD],
    group: 'Fees',
  },
  {
    key: 'invoices',
    title: 'Invoices',
    description: "Look up a student's fees",
    icon: 'receipt',
    href: '/modules/fees',
    permissions: [Permission.FEE_INVOICE_READ],
    group: 'Fees',
  },
  {
    key: 'defaulters',
    title: 'Defaulters',
    description: 'Overdue fees, call guardians',
    icon: 'alert',
    href: '/modules/fees/defaulters',
    permissions: [Permission.FEE_REPORT_READ],
    group: 'Fees',
  },
  {
    key: 'exams',
    title: 'Exams & results',
    description: 'Progress, results, publishing',
    icon: 'results',
    href: '/modules/exams',
    permissions: [Permission.EXAM_READ],
    group: 'Management',
  },
  {
    key: 'inventory',
    title: 'Inventory',
    description: 'Stock levels and movements',
    icon: 'inventory',
    href: '/modules/inventory',
    permissions: [Permission.INVENTORY_READ],
    group: 'Management',
  },
  {
    key: 'finance',
    title: 'Expenses & income',
    description: 'Record and review the ledger',
    icon: 'finance',
    href: '/modules/finance',
    permissions: [Permission.FINANCE_READ],
    group: 'Management',
  },
  {
    key: 'payslips',
    title: 'My payslips',
    description: 'Your monthly pay',
    icon: 'payslip',
    href: '/modules/payslips',
    permissions: [Permission.PAYSLIP_SELF_READ],
    group: 'Me',
  },
];

export const MODULE_GROUPS: MobileModule['group'][] = [
  'Teaching',
  'Students & staff',
  'Fees',
  'Management',
  'Me',
];

/** Each area's colour on the module grid and quick actions, so a screen of tiles scans by colour too. */
export const GROUP_TONE: Record<MobileModule['group'], TileTone> = {
  Teaching: 'primary',
  'Students & staff': 'info',
  Fees: 'success',
  Management: 'warning',
  Me: 'neutral',
};

export function modulesFor(permissions: string[] | undefined): MobileModule[] {
  const held = new Set(permissions ?? []);
  return MODULES.filter(
    (m) => m.permissions.some((p) => held.has(p)) && (m.requires ?? []).every((p) => held.has(p)),
  );
}

/** True when the user holds any of `perms` — the component-level twin of the route gate. */
export const can = (permissions: string[] | undefined, ...perms: Permission[]) =>
  perms.some((p) => (permissions ?? []).includes(p));
