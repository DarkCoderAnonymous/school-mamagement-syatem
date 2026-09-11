import { Schema, InferSchemaType, model } from 'mongoose';
import { createTenantSchema } from './base';

const notificationSchema = createTenantSchema({
  recipientUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  type: { type: String, enum: ['INFO', 'NOTICE', 'ALERT'], default: 'INFO' },
  readAt: { type: Date, default: null },
});

notificationSchema.index({ schoolId: 1, recipientUserId: 1, readAt: 1 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;
export const Notification = model('Notification', notificationSchema);
