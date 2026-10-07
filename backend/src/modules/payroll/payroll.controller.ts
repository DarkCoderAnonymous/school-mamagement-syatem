import type { Request, Response } from 'express';
import { actorFrom } from '../../utils/actor';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as s from './payroll.service';

type Handler = (req: Request, res: Response) => Promise<void>;
const id = (req: Request) => req.params.id as string;
const q = (req: Request) => req.query as Record<string, unknown>;
const list =
  (fn: (query: Record<string, unknown>) => Promise<{ items: unknown[]; meta: Parameters<typeof paginated>[2] }>): Handler =>
  async (req, res) => {
    const { items, meta } = await fn(q(req));
    paginated(res, items, meta);
  };

export const listComponents = list(s.listComponents);
export const getComponent: Handler = async (req, res) => void ok(res, await s.getComponent(id(req)));
export const createComponent: Handler = async (req, res) => void created(res, await s.createComponent(req.body, actorFrom(req)));
export const updateComponent: Handler = async (req, res) => void ok(res, await s.updateComponent(id(req), req.body, actorFrom(req)));
export const deleteComponent: Handler = async (req, res) => {
  await s.deleteComponent(id(req), actorFrom(req));
  noContent(res);
};

export const listStaff = list(s.listPayrollStaff);
export const getStaffPay: Handler = async (req, res) =>
  void ok(res, await s.getStaffPay(id(req), (req.query as { year?: number }).year));
export const listCandidates: Handler = async (_req, res) => void ok(res, await s.payrollCandidates());
export const addStaff: Handler = async (req, res) => void created(res, await s.addStaffToPayroll(req.body, actorFrom(req)));

export const listStructures = list(s.listStructures);
export const getStructure: Handler = async (req, res) => void ok(res, await s.getStructure(id(req)));
export const createStructure: Handler = async (req, res) => void created(res, await s.createStructure(req.body, actorFrom(req)));
export const updateStructure: Handler = async (req, res) => void ok(res, await s.updateStructure(id(req), req.body, actorFrom(req)));
export const deleteStructure: Handler = async (req, res) => {
  await s.deleteStructure(id(req), actorFrom(req));
  noContent(res);
};

export const listAdvances = list(s.listAdvances);
export const getAdvance: Handler = async (req, res) => void ok(res, await s.getAdvance(id(req)));
export const createAdvance: Handler = async (req, res) => void created(res, await s.createAdvance(req.body, actorFrom(req)));
export const cancelAdvance: Handler = async (req, res) => void ok(res, await s.cancelAdvance(id(req), actorFrom(req)));

export const listRuns = list(s.listRuns);
export const getRun: Handler = async (req, res) => void ok(res, await s.getRun(id(req)));
export const createRun: Handler = async (req, res) => {
  const { month, notes } = req.body as { month: string; notes?: string };
  created(res, await s.createRun(month, notes, actorFrom(req)));
};
export const recalculateRun: Handler = async (req, res) => void ok(res, await s.recalculateRun(id(req), actorFrom(req)));
export const lockRun: Handler = async (req, res) => void ok(res, await s.lockRun(id(req), actorFrom(req)));
export const publishRun: Handler = async (req, res) => void ok(res, await s.publishRun(id(req), actorFrom(req)));
export const deleteRun: Handler = async (req, res) => {
  await s.deleteRun(id(req), actorFrom(req));
  noContent(res);
};
/** A file download, deliberately outside the JSON envelope. */
export const bankExport: Handler = async (req, res) => {
  const { filename, csv } = await s.bankExport(id(req));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
};

export const getPayslip: Handler = async (req, res) => void ok(res, await s.getPayslip(id(req)));
export const updatePayslip: Handler = async (req, res) => void ok(res, await s.updatePayslip(id(req), req.body, actorFrom(req)));
export const listMyPayslips: Handler = async (req, res) => {
  const { items, meta } = await s.listMyPayslips(req.user!.sub, q(req));
  paginated(res, items, meta);
};
export const getMyPayslip: Handler = async (req, res) => void ok(res, await s.getMyPayslip(req.user!.sub, id(req)));
