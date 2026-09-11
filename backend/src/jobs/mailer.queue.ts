import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import type { MailMessage } from '../utils/mailer';

export const MAILER_QUEUE_NAME = 'mailer';

export const mailerQueue = new Queue<MailMessage>(MAILER_QUEUE_NAME, { connection: redis });

/**
 * How long a caller will wait for Redis to accept the job before giving up.
 * BullMQ's `add` first awaits its connection's `ready` event, and ioredis
 * keeps reconnecting indefinitely, so a dead Redis is never surfaced as a
 * rejected command — only this deadline turns it into one.
 *
 * This is a liveness bound, not a patience bound: a healthy Redis accepts a
 * job in single-digit milliseconds, so anything beyond this is an outage, and
 * the caller (whose transaction already committed) should not pay for it.
 */
const ENQUEUE_TIMEOUT_MS = 1000;

/**
 * Best-effort: the business transaction that led here (e.g. school
 * approval) has already committed by the time this is called, so a
 * momentarily-unreachable Redis must not fail the caller's request — it
 * should log and move on rather than throw, and must never leave the
 * request hanging.
 */
export async function enqueueMail(message: MailMessage): Promise<void> {
  let timer: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      mailerQueue.add('send', message, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${ENQUEUE_TIMEOUT_MS}ms — is Redis reachable?`)),
          ENQUEUE_TIMEOUT_MS,
        );
        // Don't let a pending timer keep the process alive during shutdown.
        timer.unref();
      }),
    ]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mailer.queue] failed to enqueue mail job', err instanceof Error ? err.message : err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
