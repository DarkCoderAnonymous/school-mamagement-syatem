import { apiClient } from '../api-client';
import { apiDelete, apiGet, apiGetPaginated, apiPatch, apiPost } from './http';
import type {
  CollectionsReport,
  Defaulter,
  FeeConcession,
  FeeHead,
  FeeInvoice,
  FeeInvoiceDetail,
  FeePayment,
  FeeSettings,
  FeeStructure,
  FeeSummary,
  FinanceCategory,
  FinanceSummary,
  GenerationPreview,
  LedgerEntry,
  LedgerType,
  PaymentMethod,
  PayrollCandidate,
  PayrollRun,
  PayrollRunDetail,
  PayrollStaff,
  Payslip,
  SalaryAdvance,
  SalaryComponent,
  SalaryStructure,
  StaffPay,
  StudentDues,
} from './types';

/** API client for fees, payroll and the finance ledger. All money is integer minor units. */
type Params = Record<string, unknown>;

// ─── Fee setup ───────────────────────────────────────────────────────────────
export const listFeeHeads = (params: Params = {}) => apiGetPaginated<FeeHead>('/fees/heads', params);
export const createFeeHead = (input: Partial<FeeHead>) => apiPost<FeeHead>('/fees/heads', input);
export const updateFeeHead = (id: string, input: Partial<FeeHead>) => apiPatch<FeeHead>(`/fees/heads/${id}`, input);
export const archiveFeeHead = (id: string) => apiDelete(`/fees/heads/${id}`);

export interface FeeStructureInput {
  name: string;
  classId: string;
  items: { feeHeadId: string; amountMinor: number }[];
}
export const listFeeStructures = (params: Params = {}) => apiGetPaginated<FeeStructure>('/fees/structures', params);
export const createFeeStructure = (input: FeeStructureInput) => apiPost<FeeStructure>('/fees/structures', input);
export const updateFeeStructure = (id: string, input: Partial<Omit<FeeStructureInput, 'classId'>>) =>
  apiPatch<FeeStructure>(`/fees/structures/${id}`, input);
export const archiveFeeStructure = (id: string) => apiDelete(`/fees/structures/${id}`);

export const getFeeSettings = () => apiGet<FeeSettings>('/fees/settings');
export const updateFeeSettings = (input: Partial<FeeSettings>) => apiPatch<FeeSettings>('/fees/settings', input);

export interface ConcessionInput {
  studentId: string;
  name: string;
  kind: FeeConcession['kind'];
  type: FeeConcession['type'];
  value: number;
  feeHeadId?: string | null;
  isActive?: boolean;
  notes?: string;
}
export const listConcessions = (params: Params = {}) => apiGetPaginated<FeeConcession>('/fees/concessions', params);
export const createConcession = (input: ConcessionInput) => apiPost<FeeConcession>('/fees/concessions', input);
export const updateConcession = (id: string, input: Partial<ConcessionInput>) =>
  apiPatch<FeeConcession>(`/fees/concessions/${id}`, input);
export const deleteConcession = (id: string) => apiDelete(`/fees/concessions/${id}`);

// ─── Invoices & payments ─────────────────────────────────────────────────────
export interface GenerateInput {
  classIds: string[];
  feeHeadIds?: string[];
  periodKey: string;
  periodLabel: string;
  issueDate?: string;
  dueDate: string;
}
export const listInvoices = (params: Params = {}) => apiGetPaginated<FeeInvoice>('/fees/invoices', params);
export const getInvoice = (id: string) => apiGet<FeeInvoiceDetail>(`/fees/invoices/${id}`);
export const previewInvoices = (input: GenerateInput) => apiPost<GenerationPreview>('/fees/invoices/preview', input);
export const generateInvoices = (input: GenerateInput) =>
  apiPost<{ invoiceCount: number; totalMinor: number }>('/fees/invoices/generate', input);
export const createInvoice = (input: {
  studentId: string;
  lines: { feeHeadId?: string; name: string; amountMinor: number }[];
  periodLabel: string;
  dueDate: string;
  applyConcessions?: boolean;
}) => apiPost<FeeInvoiceDetail>('/fees/invoices', input);
export const adjustInvoice = (id: string, input: { type: 'DISCOUNT' | 'FINE'; amountMinor: number; reason: string }) =>
  apiPost<FeeInvoiceDetail>(`/fees/invoices/${id}/adjustments`, input);
export const cancelInvoice = (id: string, reason: string) => apiPost<FeeInvoiceDetail>(`/fees/invoices/${id}/cancel`, { reason });
export const applyLateFines = () => apiPost<{ invoicesFined: number; addedMinor: number }>('/fees/invoices/apply-late-fines');

export const getStudentDues = (studentId: string) => apiGet<StudentDues>(`/fees/students/${studentId}/dues`);
export interface PaymentInput {
  studentId: string;
  amountMinor: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  paidAt?: string;
  invoiceIds?: string[];
  idempotencyKey?: string;
}
export const recordPayment = (input: PaymentInput) => apiPost<FeePayment>('/fees/payments', input);
export const listPayments = (params: Params = {}) => apiGetPaginated<FeePayment>('/fees/payments', params);
export const getPayment = (id: string) => apiGet<FeePayment>(`/fees/payments/${id}`);
export const refundPayment = (id: string, input: { amountMinor: number; reason: string; method: PaymentMethod }) =>
  apiPost<FeePayment>(`/fees/payments/${id}/refund`, input);
export const reversePayment = (id: string, reason: string) => apiPost<FeePayment>(`/fees/payments/${id}/reverse`, { reason });

// ─── Fee reports ─────────────────────────────────────────────────────────────
export const getFeeSummary = () => apiGet<FeeSummary>('/fees/summary');
export const listDefaulters = (params: Params = {}) => apiGetPaginated<Defaulter>('/fees/defaulters', params);
export const sendReminders = (studentIds?: string[]) =>
  apiPost<{ sent: number; skippedNoEmail: number; skippedStudents: string[] }>('/fees/defaulters/remind', { studentIds });
export const getCollections = (from: string, to: string) =>
  apiGet<CollectionsReport>('/fees/reports/collections', { from, to });

// ─── Payroll ─────────────────────────────────────────────────────────────────
export const listSalaryComponents = (params: Params = {}) => apiGetPaginated<SalaryComponent>('/payroll/components', params);
export const createSalaryComponent = (input: Omit<SalaryComponent, '_id' | 'schoolId' | 'isActive'> & { isActive?: boolean }) =>
  apiPost<SalaryComponent>('/payroll/components', input);
export const updateSalaryComponent = (id: string, input: Partial<Pick<SalaryComponent, 'name' | 'defaultValue' | 'isActive'>>) =>
  apiPatch<SalaryComponent>(`/payroll/components/${id}`, input);
export const archiveSalaryComponent = (id: string) => apiDelete(`/payroll/components/${id}`);

export const listPayrollStaff = (params: Params = {}) => apiGetPaginated<PayrollStaff>('/payroll/staff', params);
/** One employee's salary, open advances and payslips for `year` (their latest year when omitted). */
export const getStaffPay = (employeeId: string, year?: number) => apiGet<StaffPay>(`/payroll/staff/${employeeId}`, { year });
export const listPayrollCandidates = () => apiGet<PayrollCandidate[]>('/payroll/staff/candidates');
export const addStaffToPayroll = (input: { membershipId: string; designation: string; department?: string; joiningDate: string }) =>
  apiPost('/payroll/staff', input);

export interface SalaryStructureInput {
  employeeId: string;
  basicMinor: number;
  components: { componentId: string; value: number }[];
  bankName?: string;
  accountTitle?: string;
  accountNumber?: string;
}
export const createSalaryStructure = (input: SalaryStructureInput) => apiPost<SalaryStructure>('/payroll/structures', input);
export const updateSalaryStructure = (id: string, input: Partial<Omit<SalaryStructureInput, 'employeeId'>>) =>
  apiPatch<SalaryStructure>(`/payroll/structures/${id}`, input);

export const listAdvances = (params: Params = {}) => apiGetPaginated<SalaryAdvance>('/payroll/advances', params);
export const createAdvance = (input: { employeeId: string; amountMinor: number; installmentMinor: number; reason?: string }) =>
  apiPost<SalaryAdvance>('/payroll/advances', input);
export const cancelAdvance = (id: string) => apiDelete(`/payroll/advances/${id}`);

export const listPayrollRuns = (params: Params = {}) => apiGetPaginated<PayrollRun>('/payroll/runs', params);
export const getPayrollRun = (id: string) => apiGet<PayrollRunDetail>(`/payroll/runs/${id}`);
export const createPayrollRun = (month: string, notes?: string) => apiPost<PayrollRunDetail>('/payroll/runs', { month, notes });
export const recalculatePayrollRun = (id: string) => apiPost<PayrollRunDetail>(`/payroll/runs/${id}/recalculate`);
export const lockPayrollRun = (id: string) => apiPost<PayrollRunDetail>(`/payroll/runs/${id}/lock`);
export const publishPayrollRun = (id: string) => apiPost<PayrollRunDetail>(`/payroll/runs/${id}/publish`);
export const discardPayrollRun = (id: string) => apiDelete(`/payroll/runs/${id}`);
export const getPayslip = (id: string) => apiGet<Payslip>(`/payroll/payslips/${id}`);
export const updatePayslip = (id: string, input: { unpaidLeaveDays?: number; adjustments?: { label: string; amountMinor: number }[] }) =>
  apiPatch<Payslip>(`/payroll/payslips/${id}`, input);
export const listMyPayslips = (params: Params = {}) => apiGetPaginated<Payslip>('/payroll/my-payslips', params);
export const getMyPayslip = (id: string) => apiGet<Payslip>(`/payroll/my-payslips/${id}`);

/** The bank file is a CSV download, not a JSON envelope — fetched with auth, saved via a blob link. */
export async function downloadBankExport(runId: string, month: string): Promise<void> {
  const res = await apiClient.get(`/payroll/runs/${runId}/bank-export`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payroll-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Finance ledger ──────────────────────────────────────────────────────────
export const listFinanceCategories = (params: Params = {}) => apiGetPaginated<FinanceCategory>('/finance/categories', params);
export const createFinanceCategory = (input: { name: string; type: LedgerType }) => apiPost<FinanceCategory>('/finance/categories', input);
export const updateFinanceCategory = (id: string, name: string) => apiPatch<FinanceCategory>(`/finance/categories/${id}`, { name });
export const archiveFinanceCategory = (id: string) => apiDelete(`/finance/categories/${id}`);
export const listLedgerEntries = (params: Params = {}) => apiGetPaginated<LedgerEntry>('/finance/entries', params);
export const createLedgerEntry = (input: {
  type: LedgerType;
  categoryId: string;
  amountMinor: number;
  date: string;
  description: string;
  party?: string;
  method?: PaymentMethod;
  reference?: string;
}) => apiPost<LedgerEntry>('/finance/entries', input);
export const voidLedgerEntry = (id: string, reason: string) => apiPost<LedgerEntry>(`/finance/entries/${id}/void`, { reason });
export const getFinanceSummary = (months = 6) => apiGet<FinanceSummary>('/finance/summary', { months });
