import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { globalLimiter } from '../src/middleware/rate-limit.js';
import * as rateLimitConfigService from '../src/services/rate-limit-config.service.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('globalLimiter', () => {
  it('applies the configured quota and returns the unified 429 response', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    await rateLimitConfigService.updateRateLimitConfig({
      global: { windowSeconds: 60, maxRequests: 2 },
    });

    const app = express();
    app.use(globalLimiter);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const first = await request(app).get('/test');
    const second = await request(app).get('/test');
    const limited = await request(app).get('/test');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      success: false,
      statusCode: 429,
      message: '请求过于频繁，请稍后再试',
    });
    expect(limited.headers['ratelimit-policy']).toBe('2;w=60');
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
