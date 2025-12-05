import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export type RateLimitResult = { allowed: boolean; remaining: number; source: 'upstash' | 'local' };

export type RateLimitOptions = { windowMs?: number; maxRequests?: number };

export type RateLimiterConfig = {
  windowMs: number;
  maxRequests: number;
  prefix: string;
};

type RateLimitBucketEntry = { count: number; resetAt: number };

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;

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
      return { allowed: result.success, remaining: result.remaining, source: 'upstash' };
    }

    const now = Date.now();
    const entry = fallbackBucket.get(key);

    if (!entry || entry.resetAt < now) {
      fallbackBucket.set(key, { count: 1, resetAt: now + config.windowMs });
      return { allowed: true, remaining: config.maxRequests - 1, source: 'local' };
    }

    if (entry.count >= config.maxRequests) {
      return { allowed: false, remaining: 0, source: 'local' };
    }

    entry.count += 1;
    fallbackBucket.set(key, entry);
    return { allowed: true, remaining: config.maxRequests - entry.count, source: 'local' };
  };
}

const defaultLimiter = buildLimiter({ windowMs: DEFAULT_WINDOW_MS, maxRequests: DEFAULT_MAX_REQUESTS, prefix: 'default' });

export function createRateLimiter(config: RateLimiterConfig) {
  const limit = buildLimiter(config);

  return { limit };
}

export async function rateLimit(key: string, options: RateLimitOptions = {}) {
  const limiter = options.windowMs || options.maxRequests
    ? buildLimiter({
        windowMs: options.windowMs ?? DEFAULT_WINDOW_MS,
        maxRequests: options.maxRequests ?? DEFAULT_MAX_REQUESTS,
        prefix: 'default',
      })
    : defaultLimiter;

  return limiter(key);
}
