import {
  AlertOctagon,
  ArrowLeftRight,
  Award,
  CalendarCheck,
  CalendarOff,
  ClipboardCheck,
  PenLine,
  Banknote,
  BarChart3,
  FileText,
  HandCoins,
  Landmark,
  ReceiptText,
  Settings2,
  Wallet,
  BookOpen,
  Boxes,
  Building2,
  CalendarRange,
  CreditCard,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  Package,
  Palette,
  School,
  ShieldCheck,
  Tags,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Permission } from '@sms/shared';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only if the user holds at least one of these. Omit for "always". */
  permission?: string | string[];
  /** Match child routes too (/students/123 keeps Students active). */
  exact?: boolean;
  /**
   * Extra route prefixes that also mark this item active. For an `exact` item
   * whose children live under a sibling's path — /app/inventory must not light
   * up on /app/inventory/movements, but should on /app/inventory/items/42.
   */
  activeFor?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Navigation is a permission-driven data structure, not markup, so the
 * sidebar, the command palette and the mobile drawer all derive from one
 * source and can never drift.
 *
 * HARD RULE: only routes that actually exist appear here. The product spec
 * lists groups for Academics, People, Daily work, Exams, Finance, HR,
 * Communication, Reports and Settings — those are added to this file as each
 * module's screens land, never before. An item here that leads to a 404 or a
 * "coming soon" page is worse than no item at all, because it teaches staff
 * that parts of the product are broken.
 */
export const SCHOOL_NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ href: '/app', label: 'Dashboard', icon: LayoutDashboard, exact: true }],
  },
  {
    label: 'Academics',
    items: [
      {
        href: '/app/sessions',
        label: 'Academic sessions',
        icon: CalendarRange,
        permission: Permission.SESSION_READ,
      },
      { href: '/app/classes', label: 'Classes & sections', icon: School, permission: Permission.CLASS_READ },
      { href: '/app/subjects', label: 'Subjects', icon: BookOpen, permission: Permission.CLASS_READ },
    ],
  },
  {
    label: 'Daily work',
    items: [
      { href: '/app/attendance', label: 'Attendance', icon: ClipboardCheck, permission: Permission.ATTENDANCE_READ },
      { href: '/app/staff-attendance', label: 'Staff attendance', icon: UserCheck, permission: Permission.STAFF_ATTENDANCE_READ },
      { href: '/app/holidays', label: 'Holidays & days off', icon: CalendarOff, permission: Permission.ATTENDANCE_READ },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/app/students', label: 'Students', icon: GraduationCap, permission: Permission.STUDENT_READ },
      { href: '/app/teachers', label: 'Teachers', icon: Users, permission: Permission.TEACHER_READ },
      { href: '/app/staff', label: 'Staff & roles', icon: ShieldCheck, permission: Permission.USER_READ },
    ],
  },
  {
    label: 'Exams & results',
    items: [
      { href: '/app/exams', label: 'Exams', icon: CalendarCheck, permission: Permission.EXAM_READ },
      { href: '/app/marks', label: 'Marks entry', icon: PenLine, permission: Permission.EXAM_MARKS_ENTER },
      { href: '/app/results', label: 'Results', icon: Award, permission: Permission.EXAM_READ },
    ],
  },
  {
    label: 'Fees',
    items: [
      { href: '/app/fees/collect', label: 'Collect fees', icon: HandCoins, permission: Permission.FEE_PAYMENT_RECORD },
      {
        href: '/app/fees',
        label: 'Invoices',
        icon: FileText,
        permission: Permission.FEE_INVOICE_READ,
        exact: true,
        activeFor: ['/app/fees/invoices'],
      },
      { href: '/app/fees/payments', label: 'Receipts', icon: ReceiptText, permission: Permission.FEE_INVOICE_READ },
      { href: '/app/fees/defaulters', label: 'Defaulters', icon: AlertOctagon, permission: Permission.FEE_REPORT_READ },
      { href: '/app/fees/reports', label: 'Collection report', icon: BarChart3, permission: Permission.FEE_REPORT_READ },
      { href: '/app/fees/setup', label: 'Fee setup', icon: Settings2, permission: Permission.FEE_INVOICE_READ },
    ],
  },
  {
    label: 'Payroll & finance',
    items: [
      {
        href: '/app/payroll',
        label: 'Payroll runs',
        icon: Banknote,
        permission: Permission.PAYROLL_READ,
        exact: true,
        activeFor: ['/app/payroll/runs', '/app/payroll/payslips'],
      },
      { href: '/app/payroll/setup', label: 'Salaries & advances', icon: Wallet, permission: Permission.PAYROLL_READ },
      { href: '/app/finance', label: 'Expenses & income', icon: Landmark, permission: Permission.FINANCE_READ },
      { href: '/app/my-payslips', label: 'My payslips', icon: ReceiptText, permission: Permission.PAYSLIP_SELF_READ },
    ],
  },
  {
    label: 'Inventory',
    items: [
      {
        href: '/app/inventory',
        label: 'Stock items',
        icon: Package,
        permission: Permission.INVENTORY_READ,
        exact: true,
        activeFor: ['/app/inventory/items'],
      },
      {
        href: '/app/inventory/movements',
        label: 'Stock movements',
        icon: ArrowLeftRight,
        permission: Permission.INVENTORY_READ,
      },
      {
        href: '/app/inventory/categories',
        label: 'Categories',
        icon: Tags,
        permission: Permission.INVENTORY_READ,
      },
    ],
  },
  {
    label: 'Settings',
    items: [{ href: '/app/settings', label: 'School settings', icon: Palette, permission: Permission.SCHOOL_READ }],
  },
];

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true }],
  },
  {
    label: 'Onboarding',
    items: [
      {
        href: '/admin/registrations',
        label: 'School applications',
        icon: FileCheck2,
        permission: Permission.REGISTRATION_READ,
      },
      {
        href: '/admin/schools',
        label: 'Schools',
        icon: Building2,
        permission: Permission.SCHOOL_READ,
      },
    ],
  },
  {
    label: 'Billing',
    items: [
      {
        href: '/admin/plans',
        label: 'Plans',
        icon: CreditCard,
        permission: Permission.PLAN_MANAGE,
      },
    ],
  },
];

/**
 * Nav is keyed by name so a Server Component layout can say WHICH nav it wants
 * without passing the array itself. The items carry `icon` component
 * references, and functions cannot cross the server→client boundary — passing
 * SCHOOL_NAV directly to AppShell threw "Functions cannot be passed directly
 * to Client Components" and took down the whole route. The client shell looks
 * the array up here instead, so only a plain string crosses.
 */
export type NavKey = 'school' | 'admin';

export const NAV_BY_KEY: Record<NavKey, NavGroup[]> = {
  school: SCHOOL_NAV,
  admin: ADMIN_NAV,
};

/** Flattened, for the command palette. */
export function flattenNav(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.activeFor?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export { Boxes, Users };
