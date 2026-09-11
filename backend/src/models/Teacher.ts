import { Schema, InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

/** Teacher-specific data, 1:1 with an Employee whose designation is teaching staff. */
const teacherSchema = createTenantSchema({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, unique: true },
  subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  qualification: { type: String, trim: true },
});

export type TeacherDoc = InferSchemaType<typeof teacherSchema>;
export const Teacher = model('Teacher', teacherSchema);
