import type { Paginated } from '@sms/shared';
import { apiGet, apiGetPaginated, apiPost } from './http';

/**
 * Fees on the go: invoices, payments (receipts) and defaulters. Shapes mirror
 * the web client (frontend/src/lib/api/finance.ts + types.ts). All money is
 * integer minor units; the server computes every balance.
 */

type Ref<T> = T | null;
type Params = Record<string, string | number | undefined>;

export interface PersonName {
  _id: string;
  firstName: string;
  lastName: string;
}

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'ONLINE';
export type InvoiceStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
/** List filter: the stored statuses plus the derived OVERDUE/OPEN the API understands. */
export type InvoiceStatusFilter = InvoiceStatus | 'OVERDUE' | 'OPEN';

export interface GuardianContact extends PersonName {
  phone: string;
  email?: string;
}

export interface FeeInvoice {
  _id: string;
  invoiceNumber: string;
  studentId: Ref<
    PersonName & {
      admissionNumber: string;
      rollNumber?: string;
      guardians?: { guardianId: Ref<GuardianContact>; relation?: string; isPrimary: boolean }[];
    }
  >;
  classId: Ref<{ _id: string; name: string }>;
  sectionId: Ref<{ _id: string; name: string }>;
  periodKey: string;
  periodLabel: string;
  issueDate: string;
  dueDate: string;
  lines: { feeHeadId?: string | null; name: string; amountMinor: number; concessionMinor: number }[];
  concessions: { name: string; amountMinor: number }[];
  subtotalMinor: number;
  concessionMinor: number;
  discountMinor: number;
  fineMinor: number;
  lateFineMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  isOverdue: boolean;
  status: InvoiceStatus;
  adjustments: { type: 'DISCOUNT' | 'FINE'; amountMinor: number; reason: string; at: string; byUserId: Ref<PersonName> }[];
  cancelledAt: string | null;
  cancelReason?: string;
}

export interface FeeInvoiceDetail extends FeeInvoice {
  payments: {
    _id: string;
    receiptNumber: string;
    paidAt: string;
    method: PaymentMethod;
    status: 'COMPLETED' | 'REVERSED';
    appliedMinor: number;
    refundedMinor: number;
  }[];
  currency: string;
}

export interface FeePayment {
  _id: string;
  receiptNumber: string;
  studentId: Ref<
    PersonName & {
      admissionNumber: string;
      classId?: Ref<{ _id: string; name: string }>;
      sectionId?: Ref<{ _id: string; name: string }>;
    }
  >;
  allocations: {
    invoiceId: Ref<{ _id: string; invoiceNumber: string; periodLabel: string; totalMinor: number; paidMinor: number; status: InvoiceStatus }>;
    amountMinor: number;
    refundedMinor: number;
  }[];
  amountMinor: number;
  netMinor: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  paidAt: string;
  receivedByUserId: Ref<PersonName>;
  status: 'COMPLETED' | 'REVERSED';
  refundedMinor: number;
  refunds: { amountMinor: number; reason: string; method: PaymentMethod; at: string; byUserId: Ref<PersonName> }[];
  reversedAt: string | null;
  reversedByUserId: Ref<PersonName>;
  reversalReason?: string;
  currency?: string;
  schoolName?: string;
}

export interface DuesStudent extends PersonName {
  admissionNumber: string;
  rollNumber?: string;
  classId: Ref<{ _id: string; name: string }>;
  sectionId: Ref<{ _id: string; name: string }>;
  guardians: { guardianId: Ref<GuardianContact>; relation?: string; isPrimary: boolean }[];
  status: string;
}

/** Everything the collect screen needs for one student, in one request. */
export interface StudentDues {
  student: DuesStudent;
  /** Open invoices, oldest due first. */
  invoices: FeeInvoice[];
  totalDueMinor: number;
  overdueMinor: number;
  recentPayments: FeePayment[];
  concessions: { _id: string; name: string; type: 'PERCENT' | 'FIXED'; value: number }[];
  currency: string;
}

export interface Defaulter {
  /** The student's id. */
  _id: string;
  student: (PersonName & { admissionNumber: string; classId: Ref<{ _id: string; name: string }>; sectionId: Ref<{ _id: string; name: string }> }) | null;
  primaryContact: GuardianContact | null;
  overdueMinor: number;
  invoiceCount: number;
  oldestDueDate: string;
  daysOverdue: number;
}

/** Defaulters list: the school-wide overdue total rides in `meta` beside pagination. */
export type DefaultersPage = Paginated<Defaulter> & { meta: Paginated<Defaulter>['meta'] & { totalOverdueMinor?: number } };

export interface StudentOption extends PersonName {
  admissionNumber: string;
  rollNumber?: string;
  classId: Ref<{ _id: string; name: string }>;
  sectionId: Ref<{ _id: string; name: string }>;
}

export interface ClassOption {
  _id: string;
  name: string;
}

// ─── Invoices ────────────────────────────────────────────────────────────────
export const listInvoices = (params: Params = {}) => apiGetPaginated<FeeInvoice>('/fees/invoices', params);
export const getInvoice = (id: string) => apiGet<FeeInvoiceDetail>(`/fees/invoices/${id}`);
export const getStudentDues = (studentId: string) => apiGet<StudentDues>(`/fees/students/${studentId}/dues`);

// ─── Payments ────────────────────────────────────────────────────────────────
export interface PaymentInput {
  studentId: string;
  amountMinor: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  /** ISO instant; omit for "now". */
  paidAt?: string;
  /** Settle these invoices, in this order. */
  invoiceIds?: string[];
  /** One per collect attempt — a retry returns the first payment instead of charging twice. */
  idempotencyKey?: string;
}
export const recordPayment = (input: PaymentInput) => apiPost<FeePayment>('/fees/payments', input);
export const getPayment = (id: string) => apiGet<FeePayment>(`/fees/payments/${id}`);
export const refundPayment = (id: string, input: { amountMinor: number; reason: string; method: PaymentMethod }) =>
  apiPost<FeePayment>(`/fees/payments/${id}/refund`, input);
export const reversePayment = (id: string, reason: string) => apiPost<FeePayment>(`/fees/payments/${id}/reverse`, { reason });

// ─── Reports ─────────────────────────────────────────────────────────────────
export const listDefaulters = (params: Params = {}) => apiGet<DefaultersPage>('/fees/defaulters', params);
export const sendReminders = (studentIds?: string[]) =>
  apiPost<{ sent: number; skippedNoEmail: number; skippedStudents: string[] }>('/fees/defaulters/remind', { studentIds });

// ─── Lookups used by the fee screens ─────────────────────────────────────────
/** Active students matching a name / admission / roll number (needs student.read). */
export const searchStudents = (search: string, limit = 10) =>
  apiGetPaginated<StudentOption>('/students', { search, limit, status: 'ACTIVE' });
/** Classes of the current session, for the defaulters filter (needs class.read). */
export const listClassOptions = () => apiGetPaginated<ClassOption>('/classes', { limit: 100 });
