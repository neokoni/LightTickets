import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { globalLimiter } from '../src/middleware/rate-limit.js';
import * as rateLimitConfigService from '../src/services/rate-limit-config.service.js';
import { trustFrontendProxy } from '../src/trusted-proxy.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('globalLimiter', () => {
  it('rejects an invalid trusted proxy configuration', () => {
    const app = express();
    expect(() => trustFrontendProxy(app, ['frontend.internal'], vi.fn())).toThrow(
      'Invalid trusted proxy IP address',
    );
  });

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

  it('uses the client IP supplied by the single trusted frontend proxy', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    await rateLimitConfigService.updateRateLimitConfig({
      global: { windowSeconds: 60, maxRequests: 2 },
    });

    const app = express();
    app.use(trustFrontendProxy(app, ['127.0.0.1'], vi.fn()));
    app.use(globalLimiter);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const firstClient = () => request(app).get('/test').set('X-Forwarded-For', '198.51.100.10');
    expect((await firstClient()).status).toBe(200);
    expect((await firstClient()).status).toBe(200);
    expect((await firstClient()).status).toBe(429);

    const otherClient = await request(app).get('/test').set('X-Forwarded-For', '203.0.113.20');
    expect(otherClient.status).toBe(200);
  });

  it('ignores a spoofed client IP when the direct peer is not trusted', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    await rateLimitConfigService.updateRateLimitConfig({
      global: { windowSeconds: 60, maxRequests: 3 },
    });

    const app = express();
    app.use(trustFrontendProxy(app, ['192.0.2.50'], vi.fn()));
    app.use(globalLimiter);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    for (const spoofedIp of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      const response = await request(app).get('/test').set('X-Forwarded-For', spoofedIp);
      expect(response.status).toBe(200);
    }
    const limited = await request(app).get('/test').set('X-Forwarded-For', '203.0.113.1');
    expect(limited.status).toBe(429);
  });

  it('persists and trusts the live proxy address when upgrading a missing config field', async () => {
    const app = express();
    const persist = vi.fn(() => ['127.0.0.1']);
    app.use(trustFrontendProxy(app, null, persist));
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));

    const response = await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.25');

    expect(response.body.ip).toBe('198.51.100.25');
    expect(persist).toHaveBeenCalledWith('127.0.0.1');
  });
});
