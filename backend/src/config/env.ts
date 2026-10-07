import 'dotenv/config';
import { z } from 'zod';

/** The placeholder secrets shipped in .env.example — fine locally, never in production. */
const PLACEHOLDER_SECRET = /change_me/i;

/**
 * Express `trust proxy`: "true"/"false", a hop count ("1"), or a list of
 * trusted addresses/subnets ("loopback, 10.0.0.0/8"). It must match the real
 * deployment: trusting a proxy that isn't there lets any client choose its
 * own `req.ip` via X-Forwarded-For, which defeats every per-IP rate limit.
 */
function parseTrustProxy(raw: string): boolean | number | string {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/**
 * Validate all required environment variables at process startup.
 * If anything is missing/malformed we fail fast with a readable message
 * instead of limping along and failing later inside a request handler.
 */
export const envSchema = z.object({
  // No default: a production deploy that forgot NODE_ENV used to run as
  // "development" — honouring DEV_TEMP_PASSWORD and dropping the refresh
  // cookie's `secure` flag. Saying which environment this is is now required.
  NODE_ENV: z.enum(['development', 'test', 'production'], {
    errorMap: () => ({ message: 'NODE_ENV must be set explicitly to development, test or production' }),
  }),
  PORT: z.coerce.number().int().positive().default(4000),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // '*' is a development convenience only — refused in production below.
  CORS_ORIGIN: z.string().default('*'),

  TRUST_PROXY: z.string().default('1').transform(parseTrustProxy),

  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  /** Requests per user per minute across the authenticated API. */
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  /** Bulk operations (reminder emails, invoice generation, reports, payroll runs) per user per minute. */
  HEAVY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  /** Public school-registration submissions per IP per hour. */
  REGISTRATION_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  REDIS_URL: z.string().optional(),

  /**
   * Which mail adapter delivers email. Only `console` exists today, and it
   * delivers nothing: in production it logs recipient + subject only (never
   * the body, which carries reset tokens and temporary passwords). Production
   * must name a driver explicitly, so running without real email is a
   * decision somebody wrote down rather than an accident.
   */
  MAILER_DRIVER: z.enum(['console']).optional(),

  /**
   * DEV ONLY: every new account gets this temporary password instead of a
   * random one, so you can sign in as an invited teacher without email. They
   * are still forced to change it on first sign-in. Refused in production.
   */
  DEV_TEMP_PASSWORD: z.string().min(8, 'DEV_TEMP_PASSWORD must be at least 8 chars').optional(),
}).superRefine((e, ctx) => {
  if (e.NODE_ENV !== 'production') return;
  const fail = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (e.DEV_TEMP_PASSWORD) fail('DEV_TEMP_PASSWORD', 'DEV_TEMP_PASSWORD must not be set in production');

  // With credentials: true, '*' makes the API reflect ANY origin — a sibling
  // subdomain could then call /auth/refresh and read a fresh token pair.
  const origins = e.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length === 0 || origins.includes('*')) {
    fail('CORS_ORIGIN', 'CORS_ORIGIN must list the allowed web origins explicitly in production (no "*")');
  }

  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (e[key].length < 32) fail(key, `${key} must be at least 32 characters in production`);
    if (PLACEHOLDER_SECRET.test(e[key])) fail(key, `${key} is still the .env.example placeholder`);
  }
  if (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) {
    fail('JWT_REFRESH_SECRET', 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }

  if (!e.MAILER_DRIVER) {
    fail(
      'MAILER_DRIVER',
      'MAILER_DRIVER must be set in production. "console" is the only driver and does NOT deliver email ' +
        '(it logs recipient and subject only) — set it explicitly to acknowledge that, or add a real adapter.',
    );
  }
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:');
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
