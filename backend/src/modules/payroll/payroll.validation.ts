import { z } from 'zod';
import { COMPONENT_CALCULATIONS, COMPONENT_TYPES } from '../../models/SalaryComponent';
import { listQueryBase, objectId } from '../../utils/query';

const money = z.coerce.number().int('Amounts are in minor units (whole numbers)').min(0).max(10_000_000_000);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const code = z
  .string()
  .trim()
  .min(1, 'Code is required')
  .max(12)
  .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only');

/** PERCENT values are percentages (≤100); FIXED values are minor units (whole numbers). */
const valueFits = (calc: string | undefined, value: number | undefined) =>
  value === undefined || (calc === 'FIXED' ? Number.isInteger(value) : value <= 100);

export const createComponentSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(60),
    code,
    type: z.enum(COMPONENT_TYPES),
    calculation: z.enum(COMPONENT_CALCULATIONS),
    defaultValue: z.coerce.number().min(0),
    isActive: z.boolean().default(true),
  })
  .refine((c) => !(c.type === 'EARNING' && c.calculation === 'PERCENT_OF_GROSS'), {
    message: 'An earning can’t be a percentage of gross — gross is made of the earnings',
    path: ['calculation'],
  })
  .refine((c) => valueFits(c.calculation, c.defaultValue), {
    message: 'Percentages are at most 100; fixed amounts are whole minor units',
    path: ['defaultValue'],
  });
export const updateComponentSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  defaultValue: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

const structureFields = {
  basicMinor: money,
  components: z
    .array(z.object({ componentId: objectId, value: z.coerce.number().min(0) }))
    .max(30)
    .default([])
    .refine((c) => new Set(c.map((x) => x.componentId)).size === c.length, 'Each component can appear once'),
  bankName: z.string().trim().max(80).optional(),
  accountTitle: z.string().trim().max(80).optional(),
  accountNumber: z.string().trim().max(40).optional(),
  effectiveFrom: z.coerce.date().optional(),
};
export const createStructureSchema = z.object({ employeeId: objectId, ...structureFields });
export const updateStructureSchema = z.object({
  basicMinor: money.optional(),
  components: structureFields.components.optional(),
  bankName: structureFields.bankName,
  accountTitle: structureFields.accountTitle,
  accountNumber: structureFields.accountNumber,
  effectiveFrom: structureFields.effectiveFrom,
});

export const addStaffSchema = z.object({
  membershipId: objectId,
  designation: z.string().trim().min(1, 'Designation is required').max(80),
  department: z.string().trim().max(80).optional(),
  joiningDate: z.coerce.date(),
});

export const createAdvanceSchema = z
  .object({
    employeeId: objectId,
    amountMinor: money.refine((n) => n > 0, 'Amount must be more than zero'),
    installmentMinor: money.refine((n) => n > 0, 'Instalment must be more than zero'),
    reason: z.string().trim().max(200).optional(),
    issuedAt: z.coerce.date().optional(),
  })
  .refine((a) => a.installmentMinor <= a.amountMinor, { message: 'The instalment can’t exceed the advance', path: ['installmentMinor'] });
export const listAdvancesQuerySchema = z.object({
  ...listQueryBase,
  employeeId: objectId.optional(),
  status: z.enum(['ACTIVE', 'CLOSED', 'CANCELLED']).optional(),
});

export const createRunSchema = z.object({ month, notes: z.string().trim().max(300).optional() });
export const listRunsQuerySchema = z.object({ ...listQueryBase });

/** One employee's pay; `year` picks which year of payslips (defaults to their latest). */
export const staffPayQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });

export const updatePayslipSchema = z.object({
  unpaidLeaveDays: z.coerce.number().min(0).max(31).optional(),
  /** Signed: a bonus is positive, a penalty negative. */
  adjustments: z
    .array(z.object({ label: z.string().trim().min(1).max(60), amountMinor: z.coerce.number().int().min(-10_000_000_000).max(10_000_000_000) }))
    .max(10)
    .optional(),
});

export type CreateComponentInput = z.infer<typeof createComponentSchema>;
export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;
export type CreateStructureInput = z.infer<typeof createStructureSchema>;
export type UpdateStructureInput = z.infer<typeof updateStructureSchema>;
export type AddStaffInput = z.infer<typeof addStaffSchema>;
export type CreateAdvanceInput = z.infer<typeof createAdvanceSchema>;
export type UpdatePayslipInput = z.infer<typeof updatePayslipSchema>;
