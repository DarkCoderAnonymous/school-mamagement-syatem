import { Role } from '@sms/shared';
import type { GuardianRelation, InventoryUnit, MovementType } from './api/types';

/** SCHOOL_ADMIN → "School admin". Custom roles keep the name the school gave them. */
export function roleLabel(name: string): string {
  if (!(Object.values(Role) as string[]).includes(name)) return name;
  const words = name.toLowerCase().split('_');
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

export const RELATION_LABEL: Record<GuardianRelation, string> = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  GUARDIAN: 'Guardian',
  OTHER: 'Other',
};

export const UNIT_LABEL: Record<InventoryUnit, { one: string; many: string }> = {
  PIECE: { one: 'piece', many: 'pieces' },
  BOX: { one: 'box', many: 'boxes' },
  PACK: { one: 'pack', many: 'packs' },
  SET: { one: 'set', many: 'sets' },
  REAM: { one: 'ream', many: 'reams' },
  KG: { one: 'kg', many: 'kg' },
  LITRE: { one: 'litre', many: 'litres' },
  METRE: { one: 'metre', many: 'metres' },
  PAIR: { one: 'pair', many: 'pairs' },
};

export function quantityLabel(quantity: number, unit: InventoryUnit): string {
  const label = UNIT_LABEL[unit] ?? { one: unit.toLowerCase(), many: unit.toLowerCase() };
  return `${quantity} ${Math.abs(quantity) === 1 ? label.one : label.many}`;
}

export const MOVEMENT_LABEL: Record<MovementType, { label: string; verb: string; description: string }> = {
  RECEIVE: { label: 'Received', verb: 'Receive stock', description: 'New stock arrived — a purchase or donation.' },
  ISSUE: { label: 'Issued', verb: 'Issue', description: 'Handed out to a class, department or person.' },
  RETURN: { label: 'Returned', verb: 'Return', description: 'Something issued earlier has come back.' },
  WRITE_OFF: { label: 'Written off', verb: 'Write off', description: 'Broken, lost, expired or used up.' },
  ADJUST: {
    label: 'Adjusted',
    verb: 'Adjust count',
    description: 'A physical count disagrees with the books. Enter the difference, + or −.',
  },
};

export function fullName(person: { firstName: string; lastName: string } | null | undefined): string {
  return person ? `${person.firstName} ${person.lastName}`.trim() : '—';
}

export function initials(person: { firstName: string; lastName: string } | null | undefined): string {
  return person ? `${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`.toUpperCase() : '?';
}

/**
 * A stable tint for a person's initials avatar, so a long list of people is
 * scannable by colour as well as name. Drawn from the chart ramp — never the
 * status colours — and keyed on something that doesn't change (an id), so a
 * person keeps their colour across pages and sessions.
 */
const AVATAR_TINTS = [
  'bg-chart-1/12 text-chart-1',
  'bg-chart-2/14 text-chart-2',
  'bg-chart-5/12 text-chart-5',
  'bg-chart-3/14 text-chart-3',
  'bg-muted text-muted-foreground',
] as const;

export function avatarTint(seed: string | null | undefined): string {
  if (!seed) return AVATAR_TINTS[AVATAR_TINTS.length - 1];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length]!;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  ONLINE: 'Online',
};

/** "2026-09" → "September 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Invoice state for a badge: overdue is derived (due date passed with a balance), not stored. */
export function invoiceBadge(inv: { status: string; isOverdue?: boolean }): { status: string; label: string } {
  if (inv.status === 'CANCELLED') return { status: 'CANCELLED', label: 'Cancelled' };
  if (inv.isOverdue) return { status: 'OVERDUE', label: 'Overdue' };
  if (inv.status === 'PARTIALLY_PAID') return { status: 'PARTIALLY_PAID', label: 'Part paid' };
  if (inv.status === 'PAID') return { status: 'PAID', label: 'Paid' };
  return { status: 'UNPAID', label: 'Unpaid' };
}

/** Payroll run status → the shared status badge palette. */
export const RUN_STATUS = {
  DRAFT: { status: 'DRAFT', label: 'Draft' },
  LOCKED: { status: 'LOCKED', label: 'Locked' },
  PUBLISHED: { status: 'PUBLISHED', label: 'Published' },
} as const;

export const EXAM_TYPE_LABEL: Record<string, string> = {
  UNIT_TEST: 'Unit test',
  MIDTERM: 'Mid-term',
  FINAL: 'Final',
  MOCK: 'Mock',
  OTHER: 'Other',
};

/** Marks-entry workflow wording shown on paper badges. */
export const PAPER_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Entering marks',
  SUBMITTED: 'Awaiting verification',
  VERIFIED: 'Verified',
  PUBLISHED: 'Published',
};

export const EXAM_STATUS_LABEL: Record<string, string> = {
  SETUP: 'Setting up',
  IN_PROGRESS: 'In progress',
  PARTLY_PUBLISHED: 'Partly published',
  PUBLISHED: 'Published',
};

/** Percentages from the results API are 0–100 with up to two decimals. */
export function pctLabel(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/** Marks may be halves: 45.5, never 45.50. */
export function marksLabel(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(Number(value.toFixed(1)));
}

/** 1 → "1st", 22 → "22nd". */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}
