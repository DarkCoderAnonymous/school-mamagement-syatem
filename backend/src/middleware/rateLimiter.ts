import rateLimit, {
  ipKeyGenerator,
  MemoryStore,
  type ClientRateLimitInfo,
  type Options,
  type RateLimitRequestHandler,
  type Store,
} from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Request, Response } from 'express';
import { env } from '../config/env';
import { redis } from '../config/redis';

function tooManyRequests(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ success: false, error: { code: 'TOO_MANY_REQUESTS', message } });
  };
}

/**
 * General-purpose limiter applied to the whole /auth/* surface, on top of the
 * stricter per-email login limiter. Deliberately backed by the in-memory
 * store: it is the backstop the per-email limiter fails open to when Redis is
 * unreachable (see modules/auth/login-rate-limit.ts).
 *
 * Session upkeep is NOT counted: /refresh runs once per access-token lifetime
 * for every signed-in person, and a whole school often shares one public IP,
 * so counting it against a 20-per-15-minutes brute-force budget signed
 * campuses out. Refresh has its own failure-only limiter below; /me is
 * authenticated and covered by the per-user API limiter; /logout only ever
 * revokes.
 */
const SESSION_UPKEEP_PATHS = new Set(['/refresh', '/me', '/logout']);

/** Whether a request under /api/v1/auth is session upkeep rather than a sign-in attempt. */
export function isSessionUpkeep(req: Pick<Request, 'path'>): boolean {
  return SESSION_UPKEEP_PATHS.has(req.path);
}

export const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isSessionUpkeep,
  handler: tooManyRequests('Too many requests — try again later'),
});

/**
 * Redis first, so a limit holds across every API instance; this process's
 * memory when Redis is unreachable, so an outage degrades the limit to
 * per-instance instead of switching it off. After a Redis failure the memory
 * store is used for a short while without retrying — otherwise every request
 * during an outage would wait out Redis's reconnect attempts first.
 */
const REDIS_RETRY_AFTER_MS = 30_000;

export class RedisWithMemoryFallbackStore implements Store {
  readonly prefix: string;
  private readonly primary: RedisStore;
  private readonly fallback = new MemoryStore();
  private redisDownUntil = 0;

  constructor(prefix: string) {
    this.prefix = prefix;
    this.primary = new RedisStore({
      prefix,
      sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<unknown> as never,
    });
  }

  init(options: Options): void {
    this.fallback.init(options);
    // RedisStore loads its script here; with Redis down that rejects, which
    // express-rate-limit would log once per limiter. increment() retries it.
    Promise.resolve(this.primary.init(options)).catch(() => undefined);
  }

  private async attempt<T>(onRedis: () => Promise<T>, onMemory: () => Promise<T>): Promise<T> {
    // A connection that isn't up yet would make the command wait out its
    // reconnect attempts before failing — don't make the request wait too.
    if (redis.status !== 'ready' || Date.now() < this.redisDownUntil) return onMemory();
    try {
      return await onRedis();
    } catch {
      this.redisDownUntil = Date.now() + REDIS_RETRY_AFTER_MS;
      return onMemory();
    }
  }

  increment(key: string): Promise<ClientRateLimitInfo> {
    return this.attempt(
      () => this.primary.increment(key),
      () => this.fallback.increment(key),
    );
  }

  decrement(key: string): Promise<void> {
    return this.attempt(
      () => this.primary.decrement(key),
      () => this.fallback.decrement(key),
    );
  }

  resetKey(key: string): Promise<void> {
    return this.attempt(
      () => this.primary.resetKey(key),
      () => this.fallback.resetKey(key),
    );
  }
}

interface TargetedLimiterOptions {
  /** Redis key prefix — one per limiter; stores are never shared. */
  prefix: string;
  windowMs: number;
  limit: number;
  message: string;
  keyGenerator: (req: Request) => string | undefined;
  /** Count only failed (>= 400) responses — for limits that must never bite a normal user. */
  failuresOnly?: boolean;
}

/**
 * A limiter for one specific risk, keyed on what that risk is about (an
 * email, a user, an IP) rather than one global budget. A request whose key
 * can't be derived (e.g. no email in the body) is not counted here: the route
 * validation rejects it anyway, and the IP-level /auth limiter still applies.
 */
export function targetedLimiter(opts: TargetedLimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: opts.failuresOnly ?? false,
    skip: (req) => opts.keyGenerator(req) === undefined,
    keyGenerator: (req) => opts.keyGenerator(req) ?? 'unkeyed',
    handler: tooManyRequests(opts.message),
    store: new RedisWithMemoryFallbackStore(opts.prefix),
    passOnStoreError: true,
  });
}

function bodyEmail(req: Request): string | undefined {
  const email: unknown = req.body?.email;
  return typeof email === 'string' && email.trim() ? `email:${email.trim().toLowerCase()}` : undefined;
}

function clientIp(req: Request): string {
  // Collapses an IPv6 /64, so hopping addresses inside one subnet doesn't reset the count.
  return ipKeyGenerator(req.ip ?? 'unknown');
}

const MINUTE = 60_000;

/**
 * Failed sign-ins per ACCOUNT, from any number of IPs. The IP+email limiter
 * (login-rate-limit.ts) is dodged by rotating IPs; this one isn't. Only
 * failures count, so the person who knows their password is never slowed
 * down — the cost is that somebody spraying bad passwords at an address can
 * make its owner wait out the window.
 */
export const loginEmailLimiter = targetedLimiter({
  prefix: 'rl:login-email:',
  windowMs: 15 * MINUTE,
  limit: 20,
  failuresOnly: true,
  message: 'Too many failed sign-in attempts for this account — try again later',
  keyGenerator: bodyEmail,
});

/**
 * Reset emails per recipient address. Without it anyone could flood a
 * person's inbox (each request also invalidates the previous link). Applies
 * whether or not the address has an account, so a 429 reveals nothing.
 */
export const forgotPasswordEmailLimiter = targetedLimiter({
  prefix: 'rl:forgot-email:',
  windowMs: 60 * MINUTE,
  limit: 3,
  message: 'A reset email was requested for this address several times — check your inbox or try again later',
  keyGenerator: bodyEmail,
});

/**
 * Failed refreshes per IP. A valid refresh is never counted (a whole campus
 * behind one IP refreshes constantly); a stream of bogus or replayed tokens is.
 */
export const refreshFailureLimiter = targetedLimiter({
  prefix: 'rl:refresh-fail:',
  windowMs: 15 * MINUTE,
  limit: 60,
  failuresOnly: true,
  message: 'Too many failed session refreshes — sign in again later',
  keyGenerator: (req) => `ip:${clientIp(req)}`,
});

/**
 * Authenticated requests per PERSON across the whole API. Keyed on the user,
 * not the IP, so a school sharing one IP isn't one bucket — and one scripted
 * account can't monopolise the API that every school shares. The ceiling is
 * far above what a person clicking through the app produces.
 */
export const apiUserLimiter = targetedLimiter({
  prefix: 'rl:api-user:',
  windowMs: MINUTE,
  limit: env.API_RATE_LIMIT_MAX,
  message: 'Too many requests — slow down and try again in a minute',
  keyGenerator: (req) => (req.user?.sub ? `user:${req.user.sub}` : undefined),
});

/**
 * One shared budget per person for the few endpoints that do bulk work in a
 * single call — mass reminder email, invoice generation, late fines, the
 * collections report, exam analysis, payroll runs and the bank file. The
 * general API budget is sized for clicking through screens; these are sized
 * for a person running an operation, not a script looping it.
 */
export const heavyOperationLimiter = targetedLimiter({
  prefix: 'rl:heavy:',
  windowMs: MINUTE,
  limit: env.HEAVY_RATE_LIMIT_MAX,
  message: 'That operation was run many times in the last minute — wait a moment and try again',
  keyGenerator: (req) => (req.user?.sub ? `user:${req.user.sub}` : undefined),
});

/** Public school applications per IP. A real school applies once. */
export const registrationSubmitLimiter = targetedLimiter({
  prefix: 'rl:registration:',
  windowMs: 60 * MINUTE,
  limit: env.REGISTRATION_RATE_LIMIT_MAX,
  message: 'Too many applications from this network — try again later',
  keyGenerator: (req) => `ip:${clientIp(req)}`,
});

/** Public application-status lookups per IP (it answers for any email). */
export const registrationStatusLimiter = targetedLimiter({
  prefix: 'rl:registration-status:',
  windowMs: 60 * MINUTE,
  limit: env.REGISTRATION_RATE_LIMIT_MAX * 6,
  message: 'Too many status checks from this network — try again later',
  keyGenerator: (req) => `ip:${clientIp(req)}`,
});
