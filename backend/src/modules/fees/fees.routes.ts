import { Router } from 'express';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { heavyOperationLimiter } from '../../middleware/rateLimiter';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema, listQueryBase } from '../../utils/query';
import { z } from 'zod';
import * as c from './fees.controller';
import * as v from './fees.validation';

const can = requirePermission;
const params = validate({ params: idParamsSchema });
const basicList = validate({ query: z.object(listQueryBase) });

/**
 * @openapi
 * /fees/heads:
 *   get: { summary: List fee heads, tags: [Fees], security: [{ bearerAuth: [] }] }
 *   post: { summary: Create a fee head, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/heads/{id}:
 *   get: { summary: Get a fee head, tags: [Fees], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update a fee head, tags: [Fees], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Archive a fee head not used by any structure, tags: [Fees], security: [{ bearerAuth: [] }] }
 */
export const feeHeadsRouter = Router();
feeHeadsRouter.use(authenticate);
feeHeadsRouter.get('/', can(Permission.FEE_INVOICE_READ), basicList, c.listFeeHeads);
feeHeadsRouter.post('/', can(Permission.FEE_STRUCTURE_MANAGE), validate({ body: v.createFeeHeadSchema }), c.createFeeHead);
feeHeadsRouter.get('/:id', can(Permission.FEE_INVOICE_READ), params, c.getFeeHead);
feeHeadsRouter.patch('/:id', can(Permission.FEE_STRUCTURE_MANAGE), validate({ params: idParamsSchema, body: v.updateFeeHeadSchema }), c.updateFeeHead);
feeHeadsRouter.delete('/:id', can(Permission.FEE_STRUCTURE_MANAGE), params, c.deleteFeeHead);

/**
 * @openapi
 * /fees/structures:
 *   get: { summary: Class fee structures for a session (current by default), tags: [Fees], security: [{ bearerAuth: [] }] }
 *   post: { summary: Create a class fee structure, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/structures/{id}:
 *   get: { summary: Get a fee structure, tags: [Fees], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update a fee structure (future invoices only), tags: [Fees], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Archive a fee structure, tags: [Fees], security: [{ bearerAuth: [] }] }
 */
export const feeStructuresRouter = Router();
feeStructuresRouter.use(authenticate);
feeStructuresRouter.get('/', can(Permission.FEE_INVOICE_READ), validate({ query: v.listFeeStructuresQuerySchema }), c.listFeeStructures);
feeStructuresRouter.post('/', can(Permission.FEE_STRUCTURE_MANAGE), validate({ body: v.createFeeStructureSchema }), c.createFeeStructure);
feeStructuresRouter.get('/:id', can(Permission.FEE_INVOICE_READ), params, c.getFeeStructure);
feeStructuresRouter.patch(
  '/:id',
  can(Permission.FEE_STRUCTURE_MANAGE),
  validate({ params: idParamsSchema, body: v.updateFeeStructureSchema }),
  c.updateFeeStructure,
);
feeStructuresRouter.delete('/:id', can(Permission.FEE_STRUCTURE_MANAGE), params, c.deleteFeeStructure);

/**
 * @openapi
 * /fees/concessions:
 *   get: { summary: List student concessions (filter by studentId), tags: [Fees], security: [{ bearerAuth: [] }] }
 *   post: { summary: Grant a discount, scholarship or sibling concession, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/concessions/{id}:
 *   get: { summary: Get a concession, tags: [Fees], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update a concession, tags: [Fees], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Remove a concession, tags: [Fees], security: [{ bearerAuth: [] }] }
 */
export const concessionsRouter = Router();
concessionsRouter.use(authenticate);
concessionsRouter.get('/', can(Permission.FEE_INVOICE_READ), validate({ query: v.listConcessionsQuerySchema }), c.listConcessions);
concessionsRouter.post('/', can(Permission.FEE_CONCESSION_MANAGE), validate({ body: v.createConcessionSchema }), c.createConcession);
concessionsRouter.get('/:id', can(Permission.FEE_INVOICE_READ), params, c.getConcession);
concessionsRouter.patch('/:id', can(Permission.FEE_CONCESSION_MANAGE), validate({ params: idParamsSchema, body: v.updateConcessionSchema }), c.updateConcession);
concessionsRouter.delete('/:id', can(Permission.FEE_CONCESSION_MANAGE), params, c.deleteConcession);

/**
 * @openapi
 * /fees/invoices:
 *   get: { summary: "List invoices (status incl. OVERDUE/OPEN, class, student, period)", tags: [Fees], security: [{ bearerAuth: [] }] }
 *   post: { summary: Create a one-off invoice for one student, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/invoices/preview:
 *   post: { summary: Preview a generation run without creating anything, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/invoices/generate:
 *   post: { summary: Generate a period's invoices for classes (one transaction), tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/invoices/apply-late-fines:
 *   post: { summary: Apply the school's late-fine rule to overdue invoices, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/invoices/{id}:
 *   get: { summary: Get an invoice with its payments, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/invoices/{id}/adjustments:
 *   post: { summary: Add a one-off discount or fine, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/invoices/{id}/cancel:
 *   post: { summary: Cancel an invoice with nothing paid against it, tags: [Fees], security: [{ bearerAuth: [] }] }
 */
export const invoicesRouter = Router();
invoicesRouter.use(authenticate);
invoicesRouter.get('/', can(Permission.FEE_INVOICE_READ), validate({ query: v.listInvoicesQuerySchema }), c.listInvoices);
invoicesRouter.post('/', can(Permission.FEE_INVOICE_CREATE), validate({ body: v.createInvoiceSchema }), c.createInvoice);
invoicesRouter.post('/preview', can(Permission.FEE_INVOICE_CREATE), validate({ body: v.generateInvoicesSchema }), c.previewGeneration);
invoicesRouter.post('/generate', can(Permission.FEE_INVOICE_CREATE), heavyOperationLimiter, validate({ body: v.generateInvoicesSchema }), c.generateInvoices);
invoicesRouter.post('/apply-late-fines', can(Permission.FEE_INVOICE_ADJUST), heavyOperationLimiter, c.applyLateFines);
invoicesRouter.get('/:id', can(Permission.FEE_INVOICE_READ), params, c.getInvoice);
invoicesRouter.post(
  '/:id/adjustments',
  can(Permission.FEE_INVOICE_ADJUST),
  validate({ params: idParamsSchema, body: v.invoiceAdjustmentSchema }),
  c.adjustInvoice,
);
invoicesRouter.post('/:id/cancel', can(Permission.FEE_INVOICE_ADJUST), validate({ params: idParamsSchema, body: v.cancelInvoiceSchema }), c.cancelInvoice);

/**
 * @openapi
 * /fees/payments:
 *   get: { summary: List payments (receipts), tags: [Fees], security: [{ bearerAuth: [] }] }
 *   post: { summary: "Collect a payment against a student's dues (idempotent with idempotencyKey)", tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/payments/{id}:
 *   get: { summary: Get a receipt, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/payments/{id}/refund:
 *   post: { summary: Refund part or all of a payment, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/payments/{id}/reverse:
 *   post: { summary: Reverse a payment recorded in error, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/students/{id}/dues:
 *   get: { summary: "A student's open invoices, concessions and recent payments", tags: [Fees], security: [{ bearerAuth: [] }] }
 */
export const paymentsRouter = Router();
paymentsRouter.use(authenticate);
paymentsRouter.get('/', can(Permission.FEE_INVOICE_READ), validate({ query: v.listPaymentsQuerySchema }), c.listPayments);
paymentsRouter.post('/', can(Permission.FEE_PAYMENT_RECORD), validate({ body: v.recordPaymentSchema }), c.recordPayment);
paymentsRouter.get('/:id', can(Permission.FEE_INVOICE_READ), params, c.getPayment);
paymentsRouter.post('/:id/refund', can(Permission.FEE_PAYMENT_REFUND), validate({ params: idParamsSchema, body: v.refundPaymentSchema }), c.refundPayment);
paymentsRouter.post('/:id/reverse', can(Permission.FEE_PAYMENT_REFUND), validate({ params: idParamsSchema, body: v.reversePaymentSchema }), c.reversePayment);

/**
 * @openapi
 * /fees/settings:
 *   get: { summary: Late-fine rule and invoice/receipt prefixes, tags: [Fees], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update fee settings, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/summary:
 *   get: { summary: Billed, collected, outstanding and overdue totals, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/defaulters:
 *   get: { summary: Students with overdue fees, largest first, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/defaulters/remind:
 *   post: { summary: Email overdue reminders to primary guardians, tags: [Fees], security: [{ bearerAuth: [] }] }
 * /fees/reports/collections:
 *   get: { summary: Collections by method and day for a date range, tags: [Fees], security: [{ bearerAuth: [] }] }
 */
export const feesRouter = Router();
feesRouter.use(authenticate);
feesRouter.get('/settings', can(Permission.FEE_INVOICE_READ), c.getFeeSettings);
feesRouter.patch('/settings', can(Permission.FEE_STRUCTURE_MANAGE), validate({ body: v.updateFeeSettingsSchema }), c.updateFeeSettings);
feesRouter.get('/summary', can(Permission.FEE_REPORT_READ), c.feeSummary);
feesRouter.get('/defaulters', can(Permission.FEE_REPORT_READ), validate({ query: v.defaultersQuerySchema }), c.listDefaulters);
feesRouter.post('/defaulters/remind', can(Permission.FEE_REPORT_READ), heavyOperationLimiter, validate({ body: v.remindSchema }), c.sendReminders);
feesRouter.get('/reports/collections', can(Permission.FEE_REPORT_READ), heavyOperationLimiter, validate({ query: v.collectionsQuerySchema }), c.collectionsReport);
feesRouter.get('/students/:id/dues', can(Permission.FEE_INVOICE_READ), params, c.getStudentDues);
