import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@sms/shared';
import { authenticate } from '../../middleware/auth.middleware';
import { heavyOperationLimiter } from '../../middleware/rateLimiter';
import { requirePermission } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate.middleware';
import { idParamsSchema, listQueryBase } from '../../utils/query';
import * as c from './payroll.controller';
import * as v from './payroll.validation';

const can = requirePermission;
const params = validate({ params: idParamsSchema });
const basicList = validate({ query: z.object(listQueryBase) });

/**
 * @openapi
 * /payroll/components:
 *   get: { summary: Salary components (allowances, deductions, tax), tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   post: { summary: Create a salary component, tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/components/{id}:
 *   get: { summary: Get a component, tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Rename, re-default or deactivate a component, tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Archive an unused component, tags: [Payroll], security: [{ bearerAuth: [] }] }
 */
export const componentsRouter = Router();
componentsRouter.use(authenticate);
componentsRouter.get('/', can(Permission.PAYROLL_READ), basicList, c.listComponents);
componentsRouter.post('/', can(Permission.PAYROLL_MANAGE), validate({ body: v.createComponentSchema }), c.createComponent);
componentsRouter.get('/:id', can(Permission.PAYROLL_READ), params, c.getComponent);
componentsRouter.patch('/:id', can(Permission.PAYROLL_MANAGE), validate({ params: idParamsSchema, body: v.updateComponentSchema }), c.updateComponent);
componentsRouter.delete('/:id', can(Permission.PAYROLL_MANAGE), params, c.deleteComponent);

/**
 * @openapi
 * /payroll/structures:
 *   get: { summary: Salary structures, tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   post: { summary: "Set an employee's salary", tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/structures/{id}:
 *   get: { summary: Get a salary structure, tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   patch: { summary: Update a salary structure, tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Remove a salary structure, tags: [Payroll], security: [{ bearerAuth: [] }] }
 */
export const structuresRouter = Router();
structuresRouter.use(authenticate);
structuresRouter.get('/', can(Permission.PAYROLL_READ), basicList, c.listStructures);
structuresRouter.post('/', can(Permission.PAYROLL_MANAGE), validate({ body: v.createStructureSchema }), c.createStructure);
structuresRouter.get('/:id', can(Permission.PAYROLL_READ), params, c.getStructure);
structuresRouter.patch('/:id', can(Permission.PAYROLL_MANAGE), validate({ params: idParamsSchema, body: v.updateStructureSchema }), c.updateStructure);
structuresRouter.delete('/:id', can(Permission.PAYROLL_MANAGE), params, c.deleteStructure);

/**
 * @openapi
 * /payroll/advances:
 *   get: { summary: Salary advances and loans, tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   post: { summary: Record an advance with its monthly instalment, tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/advances/{id}:
 *   get: { summary: Get an advance, tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Cancel further recovery of an advance, tags: [Payroll], security: [{ bearerAuth: [] }] }
 */
export const advancesRouter = Router();
advancesRouter.use(authenticate);
advancesRouter.get('/', can(Permission.PAYROLL_READ), validate({ query: v.listAdvancesQuerySchema }), c.listAdvances);
advancesRouter.post('/', can(Permission.PAYROLL_MANAGE), validate({ body: v.createAdvanceSchema }), c.createAdvance);
advancesRouter.get('/:id', can(Permission.PAYROLL_READ), params, c.getAdvance);
advancesRouter.delete('/:id', can(Permission.PAYROLL_MANAGE), params, c.cancelAdvance);

/**
 * @openapi
 * /payroll/runs:
 *   get: { summary: Monthly payroll runs, tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   post: { summary: Start a month's payroll (draft payslips for everyone with a salary), tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/runs/{id}:
 *   get: { summary: A run with its payslips, tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   delete: { summary: Discard a draft run, tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/runs/{id}/recalculate:
 *   post: { summary: Rebuild a draft from current salaries, tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/runs/{id}/lock:
 *   post: { summary: Freeze a run and book advance recoveries, tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/runs/{id}/publish:
 *   post: { summary: Release payslips and post the salary expense, tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/runs/{id}/bank-export:
 *   get: { summary: Bank transfer CSV for a locked run, tags: [Payroll], security: [{ bearerAuth: [] }] }
 */
export const runsRouter = Router();
runsRouter.use(authenticate);
runsRouter.get('/', can(Permission.PAYROLL_READ), validate({ query: v.listRunsQuerySchema }), c.listRuns);
runsRouter.post('/', can(Permission.PAYROLL_RUN), heavyOperationLimiter, validate({ body: v.createRunSchema }), c.createRun);
runsRouter.get('/:id', can(Permission.PAYROLL_READ), params, c.getRun);
runsRouter.delete('/:id', can(Permission.PAYROLL_RUN), params, c.deleteRun);
runsRouter.post('/:id/recalculate', can(Permission.PAYROLL_RUN), heavyOperationLimiter, params, c.recalculateRun);
runsRouter.post('/:id/lock', can(Permission.PAYROLL_RUN), params, c.lockRun);
runsRouter.post('/:id/publish', can(Permission.PAYROLL_RUN), params, c.publishRun);
runsRouter.get('/:id/bank-export', can(Permission.PAYROLL_RUN), heavyOperationLimiter, params, c.bankExport);

/**
 * @openapi
 * /payroll/staff:
 *   get: { summary: Everyone on payroll with their salary, tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   post: { summary: Put a staff member on payroll (creates their employee record), tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/staff/candidates:
 *   get: { summary: Staff members not yet on payroll, tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/staff/{id}:
 *   get: { summary: "One employee's salary, open advances and a year of payslips (optional year)", tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/payslips/{id}:
 *   get: { summary: Get any payslip, tags: [Payroll], security: [{ bearerAuth: [] }] }
 *   patch: { summary: "Set a draft payslip's unpaid leave days or adjustments", tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/my-payslips:
 *   get: { summary: Your own published payslips, tags: [Payroll], security: [{ bearerAuth: [] }] }
 * /payroll/my-payslips/{id}:
 *   get: { summary: One of your own payslips, tags: [Payroll], security: [{ bearerAuth: [] }] }
 */
export const payrollRouter = Router();
payrollRouter.use(authenticate);
payrollRouter.get('/staff', can(Permission.PAYROLL_READ), basicList, c.listStaff);
payrollRouter.get('/staff/candidates', can(Permission.PAYROLL_MANAGE), c.listCandidates);
payrollRouter.post('/staff', can(Permission.PAYROLL_MANAGE), validate({ body: v.addStaffSchema }), c.addStaff);
payrollRouter.get('/staff/:id', can(Permission.PAYROLL_READ), validate({ params: idParamsSchema, query: v.staffPayQuerySchema }), c.getStaffPay);
payrollRouter.get('/payslips/:id', can(Permission.PAYROLL_READ), params, c.getPayslip);
payrollRouter.patch('/payslips/:id', can(Permission.PAYROLL_RUN), validate({ params: idParamsSchema, body: v.updatePayslipSchema }), c.updatePayslip);
payrollRouter.get('/my-payslips', can(Permission.PAYSLIP_SELF_READ), basicList, c.listMyPayslips);
payrollRouter.get('/my-payslips/:id', can(Permission.PAYSLIP_SELF_READ), params, c.getMyPayslip);
