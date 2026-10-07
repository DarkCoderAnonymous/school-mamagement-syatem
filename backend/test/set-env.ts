import { readFileSync } from 'node:fs';

// Runs before the test file's own imports, so config/env.ts sees these when
// it validates process.env at module-load time.
const { uri } = JSON.parse(readFileSync(`${__dirname}/.mongo-uri.json`, 'utf-8')) as { uri: string };

process.env.MONGO_URI = uri;
process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_at_least_16_chars';
process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_at_least_16_chars';
process.env.CORS_ORIGIN ??= 'http://localhost:3000';
// Deliberately a port nothing listens on: the suite must pass with Redis
// unreachable, so it doubles as a regression test for the outage handling in
// config/redis.ts (a hung login / hung school approval used to be the
// failure mode here). Forced rather than defaulted so the suite behaves the
// same whether or not the developer happens to have Redis running.
process.env.REDIS_URL = 'redis://127.0.0.1:1';
// A suite drives far more logins from one "IP" than a human ever would, and
// the default (20 per 15 min) would turn ordinary test setup into 429s. The
// limiter itself still runs — only the ceiling is raised.
process.env.AUTH_RATE_LIMIT_MAX ??= '1000';
// Same reasoning for the per-user API budget and the public registration
// endpoint, which every suite's fixtures hit from the one test "IP". Tests of
// those limiters build their own with low ceilings (rate-limits.test.ts).
process.env.API_RATE_LIMIT_MAX ??= '100000';
process.env.REGISTRATION_RATE_LIMIT_MAX ??= '100000';
process.env.HEAVY_RATE_LIMIT_MAX ??= '100000';
process.env.NODE_ENV = 'test';
