/**
 * Rate limiter with two backends:
 *
 *   1. Upstash Redis (preferred for production). Activated when both
 *      UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set. Uses
 *      @upstash/ratelimit's sliding window algorithm, which is consistent
 *      across regions and across Fluid Compute instances.
 *
 *   2. In-memory LRU sliding window. Used in development and as a safety
 *      net if Upstash credentials are missing. State is per-instance, so
 *      limits are softer than advertised under horizontal scale — fine for
 *      a single-region clinic deployment, not a public API.
 *
 * The exported function signature is identical so callers never need to
 * know which backend is in use.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
};

type RateLimitOptions = { max: number; windowMs: number };

// ---------- Upstash path ----------

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const upstashAvailable = Boolean(upstashUrl && upstashToken);

let upstashRedis: Redis | null = null;
function getUpstashRedis() {
  if (!upstashAvailable) return null;
  if (!upstashRedis) {
    upstashRedis = new Redis({
      url: upstashUrl,
      token: upstashToken,
    });
  }
  return upstashRedis;
}

// Ratelimit instances are keyed by the (max, windowMs) combination because
// Upstash requires separate instances per config. We memoize to avoid churn.
const upstashInstances = new Map<string, Ratelimit>();

function getUpstashLimiter({ max, windowMs }: RateLimitOptions) {
  const redis = getUpstashRedis();
  if (!redis) return null;

  const key = `${max}:${windowMs}`;
  const existing = upstashInstances.get(key);
  if (existing) return existing;

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const instance = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, `${windowSeconds} s`),
    // Prefix keys so multiple apps sharing a Redis instance don't collide.
    prefix: "asu-transcription:rl",
    // Analytics land in the Upstash console for visibility into abuse.
    analytics: true,
  });
  upstashInstances.set(key, instance);
  return instance;
}

// ---------- In-memory fallback ----------

type Hit = { count: number; resetAt: number };
const memoryBuckets = new Map<string, Hit>();
const MAX_TRACKED_KEYS = 10_000;

function pruneExpired(now: number) {
  if (memoryBuckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, hit] of memoryBuckets) {
    if (hit.resetAt <= now) memoryBuckets.delete(key);
  }
}

function memoryRateLimit(
  key: string,
  { max, windowMs }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
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

// ---------- Public API ----------

export async function rateLimit(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const limiter = getUpstashLimiter(options);

  if (limiter) {
    try {
      const result = await limiter.limit(key);
      return {
        allowed: result.success,
        remaining: result.remaining,
        resetSeconds: Math.max(
          0,
          Math.ceil((result.reset - Date.now()) / 1000),
        ),
      };
    } catch (error) {
      // Fail open to in-memory rather than letting Upstash outages lock
      // users out. We log loudly so this shows up in Vercel alerts.
      console.error("[rate-limit] upstash failure, falling back", error);
      return memoryRateLimit(key, options);
    }
  }

  return memoryRateLimit(key, options);
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

export function isDistributedRateLimiterActive() {
  return upstashAvailable;
}
