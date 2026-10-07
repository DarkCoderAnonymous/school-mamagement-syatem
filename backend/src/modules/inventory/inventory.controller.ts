import type { Request, Response } from 'express';
import { actorFrom } from '../../utils/actor';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as service from './inventory.service';
import type {
  CreateCategoryInput,
  CreateItemInput,
  RecordMovementInput,
  UpdateCategoryInput,
  UpdateItemInput,
} from './inventory.validation';

const id = (req: Request) => req.params.id as string;
const query = (req: Request) => req.query as Record<string, unknown>;

export async function summaryHandler(_req: Request, res: Response): Promise<void> {
  ok(res, await service.getInventorySummary());
}

export async function listCategoriesHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listCategories(query(req));
  paginated(res, items, meta);
}
export async function getCategoryHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getCategoryById(id(req)));
}
export async function createCategoryHandler(req: Request, res: Response): Promise<void> {
  created(res, await service.createCategory(req.body as CreateCategoryInput, actorFrom(req)));
}
export async function updateCategoryHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateCategory(id(req), req.body as UpdateCategoryInput, actorFrom(req)));
}
export async function deleteCategoryHandler(req: Request, res: Response): Promise<void> {
  await service.deleteCategory(id(req), actorFrom(req));
  noContent(res);
}

export async function listItemsHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listItems(query(req));
  paginated(res, items, meta);
}
export async function getItemHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.getItemById(id(req)));
}
export async function createItemHandler(req: Request, res: Response): Promise<void> {
  created(res, await service.createItem(req.body as CreateItemInput, actorFrom(req)));
}
export async function updateItemHandler(req: Request, res: Response): Promise<void> {
  ok(res, await service.updateItem(id(req), req.body as UpdateItemInput, actorFrom(req)));
}
export async function deleteItemHandler(req: Request, res: Response): Promise<void> {
  await service.deleteItem(id(req), actorFrom(req));
  noContent(res);
}

export async function recordMovementHandler(req: Request, res: Response): Promise<void> {
  created(res, await service.recordMovement(id(req), req.body as RecordMovementInput, actorFrom(req)));
}
export async function listItemMovementsHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listMovements({ ...query(req), itemId: id(req) });
  paginated(res, items, meta);
}
export async function listMovementsHandler(req: Request, res: Response): Promise<void> {
  const { items, meta } = await service.listMovements(query(req));
  paginated(res, items, meta);
}
