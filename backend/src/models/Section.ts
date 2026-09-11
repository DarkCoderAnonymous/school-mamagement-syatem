import { Schema, InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

/** e.g. Section "A" of Class "Grade 5". */
const sectionSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  classTeacherId: { type: Schema.Types.ObjectId, ref: 'Teacher' },
  capacity: { type: Number, default: 40 },
});

sectionSchema.index({ schoolId: 1, classId: 1, name: 1 }, { unique: true });

export type SectionDoc = InferSchemaType<typeof sectionSchema>;
export const Section = model('Section', sectionSchema);
