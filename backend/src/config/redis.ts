import Redis, { type RedisOptions } from 'ioredis';
import { env } from './env';

const REDIS_URL = env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Options shared by every connection. The bounded `maxRetriesPerRequest`
 * plus `commandTimeout` are what stop an unreachable Redis from turning
 * into a hung HTTP request: with `maxRetriesPerRequest: null` ioredis
 * buffers the command and retries forever, so the caller's promise never
 * settles and the request hangs until the client gives up. Callers that
 * treat Redis as best-effort (see jobs/mailer.queue.ts) can only do so if
 * the command is guaranteed to reject.
 */
const baseOptions: RedisOptions = {
  connectTimeout: 3000,
  retryStrategy: (times) => Math.min(times * 200, 5000),
};

/**
 * Connection errors fire on every reconnect attempt, which floods the logs
 * for as long as Redis is down. Log the first one per connection, then at
 * most one a minute.
 */
const LOG_INTERVAL_MS = 60_000;

function createConnection(name: string, options: RedisOptions): Redis {
  const client = new Redis(REDIS_URL, { ...baseOptions, ...options });

  let lastLoggedAt = 0;
  client.on('error', (err: Error) => {
    const now = Date.now();
    if (now - lastLoggedAt < LOG_INTERVAL_MS) return;
    lastLoggedAt = now;
    // eslint-disable-next-line no-console
    console.error(`[redis:${name}] connection error`, err.message);
  });

  return client;
}

/**
 * General-purpose connection: the login rate limiter's store and the mailer
 * queue *producer*. Commands fail fast so a Redis outage degrades those
 * callers instead of hanging them.
 */
export const redis = createConnection('main', {
  maxRetriesPerRequest: 2,
  commandTimeout: 3000,
});

/**
 * BullMQ Workers issue blocking reads (BZPOPMIN) and therefore need their own
 * connection with `maxRetriesPerRequest: null` and no command timeout — a
 * blocking read legitimately sits idle for seconds, which the settings above
 * would abort. Created on demand so a process that never runs a worker (the
 * API server in a split deployment, the seed script, tests) never opens it.
 * The caller owns it: BullMQ does not close connections it was handed.
 */
export function createBlockingConnection(): Redis {
  return createConnection('blocking', { maxRetriesPerRequest: null });
}
