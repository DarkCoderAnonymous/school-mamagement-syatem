import { createApp } from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './db/connection';
import { createBlockingConnection, redis } from './config/redis';
import { startMailerWorker } from './jobs/mailer.worker';
import { ensureRbacSeeded } from './rbac/seedRbac';

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
    console.log(`[server] docs at http://localhost:${env.PORT}/docs`);
  });

  async function shutdown(signal: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[server] received ${signal}, shutting down`);
    server.close();
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
