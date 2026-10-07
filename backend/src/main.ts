import { createApp } from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './db/connection';
import { createBlockingConnection, redis } from './config/redis';
import { startMailerWorker } from './jobs/mailer.worker';
import { ensureRbacSeeded } from './rbac/seedRbac';

const SERVER_HEADERS_TIMEOUT_MS = 20_000;
const SERVER_REQUEST_TIMEOUT_MS = 60_000;
const SHUTDOWN_GRACE_MS = 15_000;

async function bootstrap(): Promise<void> {
  await connectDB();
  await ensureRbacSeeded();

  const mailerConnection = createBlockingConnection();
  const mailerWorker = startMailerWorker(mailerConnection);
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on port ${env.PORT} (${env.NODE_ENV})`);
    // eslint-disable-next-line no-console
    if (env.NODE_ENV !== 'production') console.log(`[server] docs at http://localhost:${env.PORT}/docs`);
  });

  // Bounds on how long one connection may hold the server: a client that
  // trickles its headers or body can't pin a socket for Node's 5-minute
  // default. Well above the slowest legitimate request (reports, payroll).
  server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;
  server.requestTimeout = SERVER_REQUEST_TIMEOUT_MS;

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`[server] received ${signal}, shutting down`);
    // If draining hangs (a stuck request, an unreachable Redis), exit anyway
    // rather than wait for the orchestrator's SIGKILL.
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('[server] graceful shutdown timed out, exiting');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
    // Stop accepting connections and let in-flight requests finish before
    // the database they depend on goes away.
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mailerWorker.close();
    await disconnectDB();
    mailerConnection.disconnect();
    redis.disconnect();
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] failed to start', err);
  process.exit(1);
});
