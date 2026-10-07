import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/app';
import { connectDB } from '../src/db/connection';
import { ensureRbacSeeded } from '../src/rbac/seedRbac';

/**
 * Vercel serverless entry (see vercel.json). src/main.ts is the real server —
 * listen, the mailer worker, graceful shutdown — none of which a function can
 * do, so this only builds the app and connects to MongoDB once per warm
 * instance. The mailer worker does NOT run here: queued emails wait in Redis
 * until a long-running process (main.ts) picks them up.
 */
const app = createApp();

let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  ready ??= (async () => {
    await connectDB();
    await ensureRbacSeeded();
  })().catch((err: unknown) => {
    // Let the next request retry instead of caching the failure for the
    // instance's lifetime.
    ready = null;
    throw err;
  });
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await ensureReady();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[vercel] startup failed', err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Database unavailable' } }));
    return;
  }
  app(req, res);
}
