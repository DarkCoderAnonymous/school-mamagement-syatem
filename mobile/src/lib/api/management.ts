import type { Paginated } from '@sms/shared';
import { apiGet, apiGetPaginated, apiPost } from './http';

/**
 * Exams & results, inventory and the finance ledger — the "Management"
 * modules. Shapes mirror the web client (frontend/src/lib/api/types.ts) and
 * the backend's lean() documents. Money is always integer minor units.
 */
type Params = Record<string, string | number | undefined>;
type Ref<T> = T | null;
interface PersonName {
  _id: string;
  firstName: string;
  lastName: string;
}

export const fullName = (p: Ref<{ firstName: string; lastName: string }> | undefined) =>
  p ? `${p.firstName} ${p.lastName}`.trim() : '—';

// ─── Exams & results ─────────────────────────────────────────────────────────

export type ExamType = 'UNIT_TEST' | 'MIDTERM' | 'FINAL' | 'MOCK' | 'OTHER';
export type PaperStatus = 'OPEN' | 'SUBMITTED' | 'VERIFIED' | 'PUBLISHED';
export type ExamStatus = 'SETUP' | 'IN_PROGRESS' | 'PARTLY_PUBLISHED' | 'PUBLISHED';

export interface Exam {
  _id: string;
  name: string;
  type: ExamType;
  academicSessionId: Ref<{ _id: string; name: string }>;
  startDate: string;
  endDate: string;
  description?: string;
  status: ExamStatus;
  paperCounts: Partial<Record<PaperStatus, number>>;
  paperTotal?: number;
}

/** One class on the exam's progress board (GET /exams/:id/board). */
export interface BoardClass {
  _id: string;
  name: string;
  order: number;
  sections: { _id: string; name: string }[];
  students: number;
  papers: number;
  totalMax: number;
  marksEntered: number;
  marksExpected: number;
  statusCounts: Partial<Record<PaperStatus, number>>;
  yourPapers: number;
}

export interface ExamBoard {
  exam: { _id: string; name: string; type: ExamType; startDate: string; endDate: string };
  classes: BoardClass[];
}

export interface SubjectResult {
  subjectId?: string;
  name: string;
  code?: string;
  maxMarks: number;
  passMarks: number;
  marksObtained: number | null;
  isAbsent: boolean;
  percentage: number;
  grade: string;
  passed: boolean;
  remarks?: string;
}

/** A published result — a snapshot, corrected only by withdraw + republish. */
export interface ExamResult {
  _id: string;
  examId: string;
  studentId: string;
  classId: string;
  sectionId: string | null;
  student: { name: string; admissionNumber: string; rollNumber?: string };
  examName: string;
  className: string;
  sectionName?: string;
  subjects: SubjectResult[];
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  remark?: string;
  result: 'PASS' | 'FAIL';
  classRank: number | null;
  sectionRank: number | null;
  classSize: number;
  publishedAt: string;
}

export interface ExamSettings {
  gradingBands: { grade: string; minPercent: number; remark?: string }[];
  showPositions: boolean;
}

export interface PublishOutcome {
  classes: { classId: string; className: string; students: number; passed: number }[];
  notified: number;
}

export const listExams = (params: Params = {}) => apiGetPaginated<Exam>('/exams', params);
export const getExam = (id: string) => apiGet<Exam>(`/exams/${id}`);
export const getExamBoard = (id: string) => apiGet<ExamBoard>(`/exams/${id}/board`);
export const getExamSettings = () => apiGet<ExamSettings>('/exams/settings');
export const listResults = (params: Params = {}) =>
  apiGetPaginated<ExamResult>('/exams/results', params);
export const publishResults = (examId: string, classIds: string[]) =>
  apiPost<PublishOutcome>(`/exams/${examId}/publish`, { classIds });
export const withdrawResults = (examId: string, classId: string, reason: string) =>
  apiPost<unknown>(`/exams/${examId}/withdraw`, { classId, reason });

export const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  UNIT_TEST: 'Unit test',
  MIDTERM: 'Mid-term',
  FINAL: 'Final',
  MOCK: 'Mock',
  OTHER: 'Other',
};
export const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  SETUP: 'Setting up',
  IN_PROGRESS: 'In progress',
  PARTLY_PUBLISHED: 'Partly published',
  PUBLISHED: 'Published',
};
export const PAPER_STATUS_LABEL: Record<PaperStatus, string> = {
  OPEN: 'Entering marks',
  SUBMITTED: 'Awaiting verification',
  VERIFIED: 'Verified',
  PUBLISHED: 'Published',
};

/** Marks may be halves: 45.5, never 45.50. */
export const marksLabel = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : String(Number(v.toFixed(1)));
export const pctLabel = (v: number) => `${Number(v.toFixed(2))}%`;
export function ordinal(n: number): string {
  const rem100 = n % 100;
  const suffix =
    rem100 >= 11 && rem100 <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export type InventoryUnit =
  'PIECE' | 'BOX' | 'PACK' | 'SET' | 'REAM' | 'KG' | 'LITRE' | 'METRE' | 'PAIR';
export type MovementType = 'RECEIVE' | 'ISSUE' | 'RETURN' | 'WRITE_OFF' | 'ADJUST';

export interface InventoryItem {
  _id: string;
  name: string;
  sku: string;
  categoryId: Ref<{ _id: string; name: string }>;
  unit: InventoryUnit;
  quantityOnHand: number;
  reorderLevel: number;
  unitCostMinor: number;
  location?: string;
  description?: string;
  createdAt: string;
}

export interface InventoryMovement {
  _id: string;
  itemId: Ref<{ _id: string; name: string; sku: string; unit: InventoryUnit }> | string;
  type: MovementType;
  quantityChange: number;
  balanceAfter: number;
  unitCostMinor?: number;
  party?: string;
  reference?: string;
  note?: string;
  occurredAt: string;
  recordedByUserId: Ref<PersonName>;
}

export interface MovementInput {
  type: MovementType;
  /** Positive for every type except ADJUST, where the sign is the correction's direction. */
  quantity: number;
  unitCostMinor?: number;
  party?: string;
  reference?: string;
  note?: string;
  occurredAt?: string;
}

export interface InventoryCategory {
  _id: string;
  name: string;
  description?: string;
}

/** Everything but `name` and `categoryId` is optional; the server issues the SKU (ITM-0001) when omitted. */
export interface NewItemInput {
  name: string;
  categoryId: string;
  sku?: string;
  unit: InventoryUnit;
  reorderLevel: number;
  unitCostMinor: number;
  location?: string;
  description?: string;
  /** Stock already on the shelf; recorded as an opening RECEIVE movement. */
  openingQuantity: number;
}

export const listInventoryCategories = () =>
  apiGetPaginated<InventoryCategory>('/inventory/categories', { limit: 100, sort: 'name' });
export const createInventoryCategory = (name: string) =>
  apiPost<InventoryCategory>('/inventory/categories', { name });
export const createInventoryItem = (input: NewItemInput) =>
  apiPost<InventoryItem>('/inventory/items', input);
export const listInventoryItems = (params: Params = {}) =>
  apiGetPaginated<InventoryItem>('/inventory/items', params);
export const getInventoryItem = (id: string) => apiGet<InventoryItem>(`/inventory/items/${id}`);
export const listItemMovements = (
  id: string,
  params: Params = {},
): Promise<Paginated<InventoryMovement>> =>
  apiGetPaginated<InventoryMovement>(`/inventory/items/${id}/movements`, params);
export const recordMovement = (itemId: string, input: MovementInput) =>
  apiPost<{ movement: InventoryMovement; item: InventoryItem }>(
    `/inventory/items/${itemId}/movements`,
    input,
  );

const UNIT_LABEL: Record<InventoryUnit, { one: string; many: string }> = {
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
export const INVENTORY_UNITS = Object.keys(UNIT_LABEL) as InventoryUnit[];
export const unitLabel = (unit: InventoryUnit, many = true) => {
  const l = UNIT_LABEL[unit] ?? { one: unit.toLowerCase(), many: unit.toLowerCase() };
  return many ? l.many : l.one;
};
export const quantityLabel = (quantity: number, unit: InventoryUnit) =>
  `${quantity} ${unitLabel(unit, Math.abs(quantity) !== 1)}`;

/** Out when nothing is left; low when at or under a set reorder level (the backend's LOW_STOCK filter). */
export function stockLevel(
  item: Pick<InventoryItem, 'quantityOnHand' | 'reorderLevel'>,
): 'out' | 'low' | 'ok' {
  if (item.quantityOnHand <= 0) return 'out';
  if (item.reorderLevel > 0 && item.quantityOnHand <= item.reorderLevel) return 'low';
  return 'ok';
}

export const MOVEMENT_LABEL: Record<
  MovementType,
  { label: string; verb: string; description: string }
> = {
  RECEIVE: {
    label: 'Received',
    verb: 'Receive',
    description: 'New stock arrived — a purchase or donation.',
  },
  ISSUE: {
    label: 'Issued',
    verb: 'Issue',
    description: 'Handed out to a class, department or person.',
  },
  RETURN: {
    label: 'Returned',
    verb: 'Return',
    description: 'Something issued earlier has come back.',
  },
  WRITE_OFF: {
    label: 'Written off',
    verb: 'Write off',
    description: 'Broken, lost, expired or used up.',
  },
  ADJUST: {
    label: 'Adjusted',
    verb: 'Adjust',
    description: 'A physical count disagrees with the books. Enter the difference.',
  },
};
export const MOVEMENT_TYPES: MovementType[] = ['RECEIVE', 'ISSUE', 'RETURN', 'WRITE_OFF', 'ADJUST'];

// ─── Finance ledger ──────────────────────────────────────────────────────────

export type LedgerType = 'EXPENSE' | 'INCOME';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'ONLINE';

export interface FinanceCategory {
  _id: string;
  name: string;
  type: LedgerType;
  isSystem: boolean;
}

/** Never edited or deleted — a wrong entry is voided (kept, struck through). */
export interface LedgerEntry {
  _id: string;
  type: LedgerType;
  categoryId: Ref<{ _id: string; name: string; type: LedgerType; isSystem: boolean }>;
  amountMinor: number;
  date: string;
  description: string;
  party?: string;
  method: PaymentMethod;
  reference?: string;
  recordedByUserId: Ref<PersonName>;
  source: 'MANUAL' | 'PAYROLL';
  voidedAt: string | null;
  voidedByUserId: Ref<PersonName>;
  voidReason?: string;
}

export interface FinanceMonth {
  month: string;
  feeIncomeMinor: number;
  otherIncomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

export interface FinanceSummary {
  months: FinanceMonth[];
  totals: Omit<FinanceMonth, 'month'>;
  byCategory: { categoryId: string; name: string; type: LedgerType; amountMinor: number }[];
  currency: string;
}

export interface LedgerEntryInput {
  type: LedgerType;
  categoryId: string;
  amountMinor: number;
  /** ISO instant of the day's UTC midnight. */
  date: string;
  description: string;
  party?: string;
  method: PaymentMethod;
  reference?: string;
}

export const listFinanceCategories = (params: Params = {}) =>
  apiGetPaginated<FinanceCategory>('/finance/categories', params);
export const listLedgerEntries = (params: Params = {}) =>
  apiGetPaginated<LedgerEntry>('/finance/entries', params);
export const createLedgerEntry = (input: LedgerEntryInput) =>
  apiPost<LedgerEntry>('/finance/entries', input);
/** `months` = 1 is the current month only (in the school's timezone). */
export const getFinanceSummary = (months = 1) =>
  apiGet<FinanceSummary>('/finance/summary', { months });

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
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
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}
