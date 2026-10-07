import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/** e.g. Section "A" of Class "Grade 5". */
const sectionSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  classTeacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null },
  capacity: { type: Number, default: 40, min: 1 },
  room: { type: String, trim: true },
});

// Partial-filtered so a soft-deleted row stops occupying the key: deletes are
// soft, so without this the value could never be reused (CLAUDE.md).
sectionSchema.index(
  { schoolId: 1, classId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
sectionSchema.index({ schoolId: 1, deletedAt: 1, classId: 1 });
sectionSchema.index({ schoolId: 1, classTeacherId: 1 });

export interface SectionDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  classId: Types.ObjectId;
  classTeacherId?: Types.ObjectId | null;
  capacity: number;
  room?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Section = model<SectionDoc>('Section', sectionSchema);
