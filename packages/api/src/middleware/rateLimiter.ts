import rateLimit from 'express-rate-limit';
import { type Request, type Response, type NextFunction } from 'express';
import { redisClient } from '../db';

/**
 * Pre-configured rate limiter for agent endpoints
 * 10 requests per minute per IP
 */
export const agentRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down.',
    },
  },
});

// ============================================================================
// Redis-backed rate limiter
// ============================================================================

const RATE_LIMIT_PREFIX = 'rl:';

/**
 * In-memory fallback for when Redis is unavailable.
 * Entries expire via lazy eviction.
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

/**
 * Redis-backed sliding-window rate limiter.
 * Falls back to in-memory when Redis is unavailable.
 */
export function rateLimiter(options: {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = options.keyGenerator
      ? options.keyGenerator(req)
      : req.ip || 'unknown';
    const redisKey = `${RATE_LIMIT_PREFIX}${key}`;
    const now = Date.now();
    const windowMs = options.windowMs;
    const maxRequests = options.max;

    try {
      // Use Redis INCR + EXPIRE for atomic counting
      const count = await redisClient.incr(redisKey);

      // Set TTL only on first request in window
      if (count === 1) {
        await redisClient.pexpire(redisKey, windowMs);
      }

      // Get remaining TTL for headers
      const ttl = await redisClient.pttl(redisKey);

      if (count > maxRequests) {
        res.set('Retry-After', String(Math.ceil((ttl > 0 ? ttl : windowMs) / 1000)));
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
          },
        });
      }

      // Add rate-limit headers
      res.set('X-RateLimit-Limit', String(maxRequests));
      res.set('X-RateLimit-Remaining', String(Math.max(0, maxRequests - count)));
      if (ttl > 0) {
        res.set('X-RateLimit-Reset', String(Math.ceil((now + ttl) / 1000)));
      }

      return next();
    } catch {
      // Redis unavailable — fall back to in-memory
      evictExpired(memoryStore, now);
      return memoryRateLimit(key, now, windowMs, maxRequests, memoryStore, res, next);
    }
  };
}

/**
 * In-memory rate limit check (fallback when Redis is down).
 */
function memoryRateLimit(
  key: string,
  now: number,
  windowMs: number,
  maxRequests: number,
  store: Map<string, RateLimitEntry>,
  res: Response,
  next: NextFunction,
): void {
  const entry = store.get(key);

  if (!entry || now > entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return next();
  }

  entry.count++;

  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
    return;
  }

  next();
}

/**
 * Evict expired entries to prevent unbounded memory growth.
 */
function evictExpired(store: Map<string, RateLimitEntry>, now: number): void {
  for (const [k, v] of store) {
    if (now > v.resetTime) {
      store.delete(k);
    }
  }
}
