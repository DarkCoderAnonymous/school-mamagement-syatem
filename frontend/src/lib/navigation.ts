import {
  Building2,
  CalendarRange,
  CreditCard,
  FileCheck2,
  LayoutDashboard,
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
    ],
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

/** Flattened, for the command palette. */
export function flattenNav(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export { Users };
