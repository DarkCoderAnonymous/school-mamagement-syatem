import type { Request, Response } from 'express';
import { actorFrom } from '../../utils/actor';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as s from './finance.service';

type Handler = (req: Request, res: Response) => Promise<void>;
const id = (req: Request) => req.params.id as string;
const q = (req: Request) => req.query as Record<string, unknown>;

export const listCategories: Handler = async (req, res) => {
  const { items, meta } = await s.listCategories(q(req));
  paginated(res, items, meta);
};
export const getCategory: Handler = async (req, res) => void ok(res, await s.getCategory(id(req)));
export const createCategory: Handler = async (req, res) => void created(res, await s.createCategory(req.body, actorFrom(req)));
export const updateCategory: Handler = async (req, res) =>
  void ok(res, await s.updateCategory(id(req), (req.body as { name: string }).name, actorFrom(req)));
export const deleteCategory: Handler = async (req, res) => {
  await s.deleteCategory(id(req), actorFrom(req));
  noContent(res);
};

export const listEntries: Handler = async (req, res) => {
  const { items, meta } = await s.listEntries(q(req));
  paginated(res, items, meta);
};
export const getEntry: Handler = async (req, res) => void ok(res, await s.getEntry(id(req)));
export const createEntry: Handler = async (req, res) => void created(res, await s.createEntry(req.body, actorFrom(req)));
export const voidEntry: Handler = async (req, res) =>
  void ok(res, await s.voidEntry(id(req), (req.body as { reason: string }).reason, actorFrom(req)));
export const summary: Handler = async (req, res) => void ok(res, await s.financeSummary((q(req).months as number) ?? 6));
