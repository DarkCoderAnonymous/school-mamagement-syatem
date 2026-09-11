import { Schema, InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

/** Metadata for an uploaded file; actual bytes live behind a StorageService (local disk in dev, S3-compatible in prod). */
const fileUploadSchema = createTenantSchema({
  uploadedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  originalName: { type: String, required: true },
  storageKey: { type: String, required: true },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  entity: { type: String }, // e.g. "Student" — what this file is attached to
  entityId: { type: Schema.Types.ObjectId, default: null },
});

export type FileUploadDoc = InferSchemaType<typeof fileUploadSchema>;
export const FileUpload = model('FileUpload', fileUploadSchema);
