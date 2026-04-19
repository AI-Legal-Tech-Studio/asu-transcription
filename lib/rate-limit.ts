/**
 * In-memory sliding-window rate limiter. Fine for a single-region deployment
 * (Fluid Compute instances are reused within a region so state is often
 * preserved). For multi-region production with independent instances, move
 * this to Upstash Redis or Vercel Runtime Cache.
 */
type Hit = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Hit>();
const MAX_TRACKED_KEYS = 10_000;

function pruneExpired(now: number) {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, hit] of buckets) {
    if (hit.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
};

export function rateLimit(
  key: string,
  { max, windowMs }: { max: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: max - 1,
      resetSeconds: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, max - existing.count);
  return {
    allowed: existing.count <= max,
    remaining,
    resetSeconds: Math.max(0, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/**
 * Resolve a best-effort client IP from the incoming request headers.
 * Vercel sets `x-real-ip` and `x-forwarded-for`; we strip to the first hop.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstHop = forwardedFor.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
