import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema } from '../../utils/query';
import * as c from './finance.controller';
import * as v from './finance.validation';

const can = requirePermission;
const params = validate({ params: idParamsSchema });

/**
 * @openapi
 * /finance/categories:
 *   get: { summary: Expense and income categories, tags: [Finance], security: [{ bearerAuth: [] }] }
 *   post: { summary: Create a category, tags: [Finance], security: [{ bearerAuth: [] }] }
 * /finance/categories/{id}:
 *   get: { summary: Get a category, tags: [Finance], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Rename a category, tags: [Finance], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Archive an unused category, tags: [Finance], security: [{ bearerAuth: [] }] }
 */
export const financeCategoriesRouter = Router();
financeCategoriesRouter.use(authenticate);
financeCategoriesRouter.get('/', can(Permission.FINANCE_READ), validate({ query: v.listCategoriesQuerySchema }), c.listCategories);
financeCategoriesRouter.post('/', can(Permission.FINANCE_MANAGE), validate({ body: v.createCategorySchema }), c.createCategory);
financeCategoriesRouter.get('/:id', can(Permission.FINANCE_READ), params, c.getCategory);
financeCategoriesRouter.patch('/:id', can(Permission.FINANCE_MANAGE), validate({ params: idParamsSchema, body: v.updateCategorySchema }), c.updateCategory);
financeCategoriesRouter.delete('/:id', can(Permission.FINANCE_MANAGE), params, c.deleteCategory);

/**
 * @openapi
 * /finance/entries:
 *   get: { summary: Expenses and other income (voided hidden unless asked), tags: [Finance], security: [{ bearerAuth: [] }] }
 *   post: { summary: Record an expense or income, tags: [Finance], security: [{ bearerAuth: [] }] }
 * /finance/entries/{id}:
 *   get: { summary: Get an entry, tags: [Finance], security: [{ bearerAuth: [] }] }
 * /finance/entries/{id}/void:
 *   post: { summary: Void an entry (kept for the record), tags: [Finance], security: [{ bearerAuth: [] }] }
 * /finance/summary:
 *   get: { summary: Fee income, other income and expenses by month, tags: [Finance], security: [{ bearerAuth: [] }] }
 */
export const ledgerRouter = Router();
ledgerRouter.use(authenticate);
ledgerRouter.get('/', can(Permission.FINANCE_READ), validate({ query: v.listEntriesQuerySchema }), c.listEntries);
ledgerRouter.post('/', can(Permission.FINANCE_RECORD), validate({ body: v.createEntrySchema }), c.createEntry);
ledgerRouter.get('/:id', can(Permission.FINANCE_READ), params, c.getEntry);
ledgerRouter.post('/:id/void', can(Permission.FINANCE_MANAGE), validate({ params: idParamsSchema, body: v.voidEntrySchema }), c.voidEntry);

export const financeRouter = Router();
financeRouter.use(authenticate);
financeRouter.get('/summary', can(Permission.FINANCE_READ), validate({ query: v.summaryQuerySchema }), c.summary);
