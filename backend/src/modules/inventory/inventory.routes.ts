import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema } from '../../utils/query';
import * as c from './inventory.controller';
import {
  createCategorySchema,
  createItemSchema,
  listCategoriesQuerySchema,
  listItemsQuerySchema,
  listMovementsQuerySchema,
  recordMovementSchema,
  updateCategorySchema,
  updateItemSchema,
} from './inventory.validation';

const READ = requirePermission(Permission.INVENTORY_READ);
const MANAGE = requirePermission(Permission.INVENTORY_MANAGE);
const STOCK = requirePermission(Permission.INVENTORY_STOCK_RECORD);
const params = validate({ params: idParamsSchema });

/**
 * @openapi
 * /inventory/summary:
 *   get: { summary: Stock value, low/out-of-stock counts, recent activity, tags: [Inventory], security: [{ bearerAuth: [] }] }
 */
export const inventoryRouter = Router();
inventoryRouter.use(authenticate);
inventoryRouter.get('/summary', READ, c.summaryHandler);

/**
 * @openapi
 * /inventory/categories:
 *   get: { summary: List categories with item counts, tags: [Inventory], security: [{ bearerAuth: [] }] }
 *   post: { summary: Create a category, tags: [Inventory], security: [{ bearerAuth: [] }] }
 * /inventory/categories/{id}:
 *   get: { summary: Get a category, tags: [Inventory], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update a category, tags: [Inventory], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Archive an empty category, tags: [Inventory], security: [{ bearerAuth: [] }] }
 */
export const categoriesRouter = Router();
categoriesRouter.use(authenticate);
categoriesRouter.get('/', READ, validate({ query: listCategoriesQuerySchema }), c.listCategoriesHandler);
categoriesRouter.post('/', MANAGE, validate({ body: createCategorySchema }), c.createCategoryHandler);
categoriesRouter.get('/:id', READ, params, c.getCategoryHandler);
categoriesRouter.patch('/:id', MANAGE, validate({ params: idParamsSchema, body: updateCategorySchema }), c.updateCategoryHandler);
categoriesRouter.delete('/:id', MANAGE, params, c.deleteCategoryHandler);

/**
 * @openapi
 * /inventory/items:
 *   get: { summary: List items (category, stock level, search), tags: [Inventory], security: [{ bearerAuth: [] }] }
 *   post: { summary: Create an item, optionally with opening stock, tags: [Inventory], security: [{ bearerAuth: [] }] }
 * /inventory/items/{id}:
 *   get: { summary: Get an item, tags: [Inventory], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update an item's details (not its quantity), tags: [Inventory], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Archive an item with no stock left, tags: [Inventory], security: [{ bearerAuth: [] }] }
 * /inventory/items/{id}/movements:
 *   get: { summary: "The item's stock ledger", tags: [Inventory], security: [{ bearerAuth: [] }] }
 *   post: { summary: Receive, issue, return, write off or adjust stock, tags: [Inventory], security: [{ bearerAuth: [] }] }
 */
export const itemsRouter = Router();
itemsRouter.use(authenticate);
itemsRouter.get('/', READ, validate({ query: listItemsQuerySchema }), c.listItemsHandler);
itemsRouter.post('/', MANAGE, validate({ body: createItemSchema }), c.createItemHandler);
itemsRouter.get('/:id', READ, params, c.getItemHandler);
itemsRouter.patch('/:id', MANAGE, validate({ params: idParamsSchema, body: updateItemSchema }), c.updateItemHandler);
itemsRouter.delete('/:id', MANAGE, params, c.deleteItemHandler);
itemsRouter.get(
  '/:id/movements',
  READ,
  validate({ params: idParamsSchema, query: listMovementsQuerySchema.omit({ itemId: true }) }),
  c.listItemMovementsHandler,
);
itemsRouter.post(
  '/:id/movements',
  STOCK,
  validate({ params: idParamsSchema, body: recordMovementSchema }),
  c.recordMovementHandler,
);

/**
 * The ledger is append-only: there is no update or delete. A mistake is
 * corrected with an ADJUST movement, so the audit trail stays true.
 *
 * @openapi
 * /inventory/movements:
 *   get: { summary: School-wide stock ledger (item, type, date range), tags: [Inventory], security: [{ bearerAuth: [] }] }
 */
export const movementsRouter = Router();
movementsRouter.use(authenticate);
movementsRouter.get('/', READ, validate({ query: listMovementsQuerySchema }), c.listMovementsHandler);
