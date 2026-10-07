import { model, Types } from 'mongoose';
import { createTenantSchema } from './base';

const subjectSchema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  isElective: { type: Boolean, default: false },
  description: { type: String, trim: true },
});

// Partial-filtered so a soft-deleted row stops occupying the key: deletes are
// soft, so without this the value could never be reused (CLAUDE.md).
subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
subjectSchema.index({ schoolId: 1, deletedAt: 1, name: 1 });

export interface SubjectDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  name: string;
  code: string;
  isElective: boolean;
  description?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Subject = model<SubjectDoc>('Subject', subjectSchema);
