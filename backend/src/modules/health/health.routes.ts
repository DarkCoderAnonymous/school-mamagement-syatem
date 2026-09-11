import { Router } from 'express';
import mongoose from 'mongoose';
import { redis } from '../../config/redis';
import { ok } from '../../utils/response';

const router = Router();

const MONGOOSE_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Liveness/readiness check — reports DB and Redis connectivity
 *     tags: [Health]
 */
router.get('/', async (_req, res) => {
  const db = MONGOOSE_STATES[mongoose.connection.readyState] ?? 'unknown';

  let redisStatus = 'disconnected';
  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch {
    redisStatus = 'disconnected';
  }

  ok(res, { status: 'ok', db, redis: redisStatus, timestamp: new Date().toISOString() });
});

export default router;
