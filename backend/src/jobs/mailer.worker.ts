import { Worker } from 'bullmq';
import type Redis from 'ioredis';
import { mailer, type MailMessage } from '../utils/mailer';
import { MAILER_QUEUE_NAME } from './mailer.queue';

/**
 * The worker needs a blocking connection (see createBlockingConnection in
 * config/redis.ts) rather than the shared fail-fast one. The caller creates
 * and closes it, because BullMQ never closes a connection it was handed.
 */
export function startMailerWorker(connection: Redis): Worker<MailMessage> {
  return new Worker<MailMessage>(
    MAILER_QUEUE_NAME,
    async (job) => {
      await mailer.send(job.data);
    },
    { connection },
  );
}
