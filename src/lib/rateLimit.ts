import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type RateLimitBucketEntry = { count: number; resetAt: number };

export type RateLimitResult = { allowed: boolean; remaining: number };

type RateLimiterConfig = {
  windowMs: number;
  maxRequests: number;
  prefix: string;
};

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;

const globalBucket: Map<string, { count: number; resetAt: number }> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__rateLimitBucket || new Map();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__rateLimitBucket = globalBucket;

export type RateLimitOptions = { windowMs?: number; maxRequests?: number };
export type RateLimitResult = { allowed: boolean; remaining: number; source: 'external' | 'local' };

async function checkExternalRateLimit(key: string, options: Required<RateLimitOptions>): Promise<RateLimitResult | null> {
  const endpoint = process.env.RATE_LIMIT_SERVICE_URL;
  if (!endpoint) return null;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, windowMs: options.windowMs, maxRequests: options.maxRequests }),
    });

    if (!response.ok) {
      console.warn('[rateLimit] Servicio de rate limit externo respondió con error', response.status);
      return null;
    }

    const payload = (await response.json()) as { allowed?: boolean; remaining?: number };
    if (typeof payload?.allowed === 'boolean') {
      return {
        allowed: payload.allowed,
        remaining: typeof payload.remaining === 'number' ? payload.remaining : 0,
        source: 'external',
      };
    }
  } catch (error) {
    console.warn('[rateLimit] No se pudo consultar el servicio externo, usando memoria local', error);
  }

  return null;
}

function checkLocalRateLimit(key: string, options: Required<RateLimitOptions>): RateLimitResult {
  const now = Date.now();
  const entry = globalBucket.get(key);

  if (!entry || entry.resetAt < now) {
    globalBucket.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.maxRequests - 1, source: 'local' };
  }

  if (entry.count >= options.maxRequests) {
    return { allowed: false, remaining: 0, source: 'local' };
  }

  entry.count += 1;
  globalBucket.set(key, entry);
  return { allowed: true, remaining: options.maxRequests - entry.count, source: 'local' };
}

export async function rateLimit(key: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  const settings = { windowMs: options.windowMs ?? WINDOW_MS, maxRequests: options.maxRequests ?? MAX_REQUESTS } as const;

  const externalResult = await checkExternalRateLimit(key, settings);
  if (externalResult) return externalResult;

  return checkLocalRateLimit(key, settings);
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const sharedRedisClient = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

function buildLimiter(config: RateLimiterConfig) {
  const fallbackBucket = new Map<string, RateLimitBucketEntry>();

  const windowSeconds = Math.ceil(config.windowMs / 1000);
  const limiter = sharedRedisClient
    ? new Ratelimit({
        redis: sharedRedisClient,
        limiter: Ratelimit.slidingWindow(config.maxRequests, `${windowSeconds} s`),
        prefix: `miniappworld:${config.prefix}`,
      })
    : null;

  return async function limit(key: string): Promise<RateLimitResult> {
    if (limiter) {
      const result = await limiter.limit(key);
      return { allowed: result.success, remaining: result.remaining };
    }

    const now = Date.now();
    const entry = fallbackBucket.get(key);

    if (!entry || entry.resetAt < now) {
      fallbackBucket.set(key, { count: 1, resetAt: now + config.windowMs });
      return { allowed: true, remaining: config.maxRequests - 1 };
    }

    if (entry.count >= config.maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    entry.count += 1;
    fallbackBucket.set(key, entry);
    return { allowed: true, remaining: config.maxRequests - entry.count };
  };
}

const defaultLimiter = buildLimiter({ windowMs: WINDOW_MS, maxRequests: MAX_REQUESTS, prefix: 'default' });

export function createRateLimiter(config: RateLimiterConfig) {
  const limit = buildLimiter(config);

  return {
    limit,
  };
}

export async function rateLimit(key: string) {
  return defaultLimiter(key);
}
