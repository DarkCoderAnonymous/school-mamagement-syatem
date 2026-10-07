import type { Request, Response } from 'express';
import { actorFrom } from '../../utils/actor';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as setup from './fee-setup.service';
import * as invoices from './invoices.service';
import * as payments from './payments.service';
import * as reports from './fee-reports.service';

/** Thin handlers: bodies/queries are already Zod-validated by the route. */
const id = (req: Request) => req.params.id as string;
const q = (req: Request) => req.query as Record<string, unknown>;
type Handler = (req: Request, res: Response) => Promise<void>;

const list =
  (fn: (query: Record<string, unknown>) => Promise<{ items: unknown[]; meta: Parameters<typeof paginated>[2] }>): Handler =>
  async (req, res) => {
    const { items, meta } = await fn(q(req));
    paginated(res, items, meta);
  };

// Heads
export const listFeeHeads = list(setup.listFeeHeads);
export const getFeeHead: Handler = async (req, res) => void ok(res, await setup.getFeeHead(id(req)));
export const createFeeHead: Handler = async (req, res) => void created(res, await setup.createFeeHead(req.body, actorFrom(req)));
export const updateFeeHead: Handler = async (req, res) => void ok(res, await setup.updateFeeHead(id(req), req.body, actorFrom(req)));
export const deleteFeeHead: Handler = async (req, res) => {
  await setup.deleteFeeHead(id(req), actorFrom(req));
  noContent(res);
};

// Structures
export const listFeeStructures = list(setup.listFeeStructures);
export const getFeeStructure: Handler = async (req, res) => void ok(res, await setup.getFeeStructure(id(req)));
export const createFeeStructure: Handler = async (req, res) =>
  void created(res, await setup.createFeeStructure(req.body, actorFrom(req)));
export const updateFeeStructure: Handler = async (req, res) =>
  void ok(res, await setup.updateFeeStructure(id(req), req.body, actorFrom(req)));
export const deleteFeeStructure: Handler = async (req, res) => {
  await setup.deleteFeeStructure(id(req), actorFrom(req));
  noContent(res);
};

// Settings
export const getFeeSettings: Handler = async (_req, res) => void ok(res, await setup.getFeeSettings());
export const updateFeeSettings: Handler = async (req, res) => void ok(res, await setup.updateFeeSettings(req.body, actorFrom(req)));

// Concessions
export const listConcessions = list(setup.listConcessions);
export const getConcession: Handler = async (req, res) => void ok(res, await setup.getConcession(id(req)));
export const createConcession: Handler = async (req, res) => void created(res, await setup.createConcession(req.body, actorFrom(req)));
export const updateConcession: Handler = async (req, res) =>
  void ok(res, await setup.updateConcession(id(req), req.body, actorFrom(req)));
export const deleteConcession: Handler = async (req, res) => {
  await setup.deleteConcession(id(req), actorFrom(req));
  noContent(res);
};

// Invoices
export const listInvoices = list(invoices.listInvoices);
export const getInvoice: Handler = async (req, res) => void ok(res, await invoices.getInvoice(id(req)));
export const createInvoice: Handler = async (req, res) => void created(res, await invoices.createInvoice(req.body, actorFrom(req)));
export const previewGeneration: Handler = async (req, res) => void ok(res, await invoices.previewGeneration(req.body));
export const generateInvoices: Handler = async (req, res) => void created(res, await invoices.generateInvoices(req.body, actorFrom(req)));
export const adjustInvoice: Handler = async (req, res) => void ok(res, await invoices.adjustInvoice(id(req), req.body, actorFrom(req)));
export const cancelInvoice: Handler = async (req, res) =>
  void ok(res, await invoices.cancelInvoice(id(req), (req.body as { reason: string }).reason, actorFrom(req)));
export const applyLateFines: Handler = async (req, res) => void ok(res, await invoices.applyLateFines(actorFrom(req)));

// Payments
export const listPayments = list(payments.listPayments);
export const getPayment: Handler = async (req, res) => void ok(res, await payments.getPayment(id(req)));
export const recordPayment: Handler = async (req, res) => void created(res, await payments.recordPayment(req.body, actorFrom(req)));
export const refundPayment: Handler = async (req, res) => void ok(res, await payments.refundPayment(id(req), req.body, actorFrom(req)));
export const reversePayment: Handler = async (req, res) =>
  void ok(res, await payments.reversePayment(id(req), (req.body as { reason: string }).reason, actorFrom(req)));
export const getStudentDues: Handler = async (req, res) => void ok(res, await payments.getStudentDues(id(req)));

// Reports
export const listDefaulters: Handler = async (req, res) => {
  const { items, meta, totalOverdueMinor } = await reports.listDefaulters(q(req));
  // The overdue total rides in `meta`, beside pagination, so the envelope stays standard.
  paginated(res, items, { ...meta, totalOverdueMinor } as typeof meta);
};
export const sendReminders: Handler = async (req, res) =>
  void ok(res, await reports.sendReminders((req.body as { studentIds?: string[] }).studentIds, actorFrom(req)));
export const collectionsReport: Handler = async (req, res) => {
  const { from, to } = req.query as unknown as { from: Date; to: Date };
  ok(res, await reports.collectionsReport(from, to));
};
export const feeSummary: Handler = async (_req, res) => void ok(res, await reports.feeSummary());
