const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;
const bucket = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = bucket.get(key);

  if (!entry || entry.resetAt < now) {
    bucket.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  bucket.set(key, entry);
  return { allowed: true, remaining: MAX_REQUESTS - entry.count };
}
