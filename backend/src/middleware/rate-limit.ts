import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import type { RequestRateLimitRule } from '../constants/rate-limit.js';
import * as rateLimitConfigService from '../services/rate-limit-config.service.js';

interface RateLimitBucket {
  hits: number;
  resetAt: number;
}

const CLEANUP_INTERVAL_MS = 60_000;

function shouldSkipRateLimit(): boolean {
  return process.env.NODE_ENV === 'test' || !!process.env.VITEST;
}

function createRateLimiter(
  selectRule: (
    config: Awaited<ReturnType<typeof rateLimitConfigService.getRateLimitConfig>>,
  ) => RequestRateLimitRule,
): RequestHandler {
  const buckets = new Map<string, RateLimitBucket>();
  let activeRule = '';

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  cleanup.unref();

  return async (req: Request, res: Response, next: NextFunction) => {
    if (shouldSkipRateLimit()) {
      next();
      return;
    }

    try {
      const rule = selectRule(await rateLimitConfigService.getRateLimitConfig());
      const ruleKey = `${rule.windowSeconds}:${rule.maxRequests}`;
      if (ruleKey !== activeRule) {
        buckets.clear();
        activeRule = ruleKey;
      }

      const now = Date.now();
      const key = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown');
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = {
          hits: 0,
          resetAt: now + rule.windowSeconds * 1_000,
        };
        buckets.set(key, bucket);
      }
      bucket.hits += 1;

      const remaining = Math.max(rule.maxRequests - bucket.hits, 0);
      const resetSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1_000), 1);
      res.setHeader('RateLimit-Policy', `${rule.maxRequests};w=${rule.windowSeconds}`);
      res.setHeader('RateLimit-Limit', String(rule.maxRequests));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(resetSeconds));

      if (bucket.hits > rule.maxRequests) {
        res.setHeader('Retry-After', String(resetSeconds));
        res.status(429).json({
          success: false,
          statusCode: 429,
          message: '请求过于频繁，请稍后再试',
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const globalLimiter = createRateLimiter((config) => config.global);
export const authLimiter = createRateLimiter((config) => config.auth);
