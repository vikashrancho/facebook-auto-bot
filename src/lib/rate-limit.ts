import { NextResponse } from "next/server";

export interface RateLimitConfig {
  /** Maximum number of allowed requests in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

// In-memory token bucket cache per key
const buckets = new Map<string, BucketEntry>();

// Periodic cleanup of stale buckets every 5 minutes to prevent memory leaks
let cleanupInterval: NodeJS.Timeout | null = null;
if (typeof setInterval !== "undefined" && !cleanupInterval) {
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (now - bucket.lastRefill > 300_000) {
        buckets.delete(key);
      }
    }
  }, 300_000);
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

/**
 * Extracts a reliable client IP address from standard proxy headers.
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const clientIp = forwardedFor.split(",")[0].trim();
    if (clientIp) return clientIp;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();
  return "127.0.0.1";
}

/**
 * Checks and consumes a token from the rate limit bucket.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const refillRate = config.limit / windowMs; // tokens per ms

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: config.limit, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = Math.max(0, now - bucket.lastRefill);
  bucket.tokens = Math.min(config.limit, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      limit: config.limit,
      remaining: Math.floor(bucket.tokens),
      resetSeconds: Math.ceil((config.limit - bucket.tokens) / (config.limit / config.windowSeconds)),
    };
  }

  const waitTimeMs = (1 - bucket.tokens) / refillRate;
  return {
    allowed: false,
    limit: config.limit,
    remaining: 0,
    resetSeconds: Math.ceil(waitTimeMs / 1000),
  };
}

/**
 * Pre-configured rate limit tiers for critical application operations.
 */
export const RATE_LIMIT_TIERS = {
  /** Login endpoint: 5 attempts per 60 seconds per IP to mitigate brute force */
  AUTH_LOGIN: { limit: 5, windowSeconds: 60 },
  /** Custom GPT Actions: 60 requests per 60 seconds */
  CHATGPT_ACTIONS: { limit: 60, windowSeconds: 60 },
  /** Content & Image Generation: 20 requests per 60 seconds */
  GENERATION: { limit: 20, windowSeconds: 60 },
  /** Scheduler / Cron: 15 invocations per 60 seconds */
  CRON_SCHEDULER: { limit: 15, windowSeconds: 60 },
  /** Standard API endpoints: 120 requests per 60 seconds */
  STANDARD_API: { limit: 120, windowSeconds: 60 },
} as const;

/**
 * Creates a standard HTTP 429 Too Many Requests response with RFC rate-limit headers.
 */
export function rateLimitExceededResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: "Too many requests. Please slow down and try again later.",
      retryAfterSeconds: result.resetSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": result.resetSeconds.toString(),
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": result.resetSeconds.toString(),
      },
    }
  );
}

/**
 * Injects rate-limit headers into an outgoing successful response.
 */
export function applyRateLimitHeaders(res: NextResponse, result: RateLimitResult): NextResponse {
  res.headers.set("X-RateLimit-Limit", result.limit.toString());
  res.headers.set("X-RateLimit-Remaining", result.remaining.toString());
  res.headers.set("X-RateLimit-Reset", result.resetSeconds.toString());
  return res;
}
