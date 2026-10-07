import { model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * A day or run of days the school is closed — a public holiday, Eid, the
 * winter break. No register is expected or accepted on these days
 * (services/school-calendar.service). Weekly days off (Sundays) are a school
 * setting, not rows here. Dates are calendar days at UTC midnight, inclusive.
 */
const holidaySchema = createTenantSchema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
});

// "Is this day a holiday?" and the calendar list, both by date range.
holidaySchema.index({ schoolId: 1, deletedAt: 1, startDate: 1, endDate: 1 });

export interface HolidayDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Holiday = model<HolidayDoc>('Holiday', holidaySchema);
