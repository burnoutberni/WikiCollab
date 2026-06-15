import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRateLimiter, resetRateLimiters } from '../../middleware/rate-limit.js';

function createTestApp(max = 3, windowSec = 1) {
  const limiter = createRateLimiter({ max, windowMs: windowSec * 1000 });
  const app = new Hono();
  app.use('/api/test', limiter);
  app.get('/api/test', (c) => c.json({ ok: true }));
  return app;
}

describe('Rate limit middleware', () => {
  beforeEach(() => {
    resetRateLimiters();
  });

  it('allows requests under the limit', async () => {
    const app = createTestApp(3, 60);
    const res = await app.request('/api/test');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 429 when limit is exceeded', async () => {
    const app = createTestApp(2, 60);

    const r1 = await app.request('/api/test');
    expect(r1.status).toBe(200);

    const r2 = await app.request('/api/test');
    expect(r2.status).toBe(200);

    const r3 = await app.request('/api/test');
    expect(r3.status).toBe(429);

    const body = await r3.json();
    expect(body.error).toBe('Too many requests, please try again later');
  });

  it('sets Retry-After header on 429', async () => {
    const app = createTestApp(1, 60);

    await app.request('/api/test');

    const res = await app.request('/api/test');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    const retryAfter = parseInt(res.headers.get('Retry-After')!, 10);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('resets after the window expires', async () => {
    const app = createTestApp(1, 1);

    await app.request('/api/test');

    const r2 = await app.request('/api/test');
    expect(r2.status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const r3 = await app.request('/api/test');
    expect(r3.status).toBe(200);
  }, 5000);

  it('per-IP isolation: different IPs have separate counters', async () => {
    const app = createTestApp(1, 60);

    const r1 = await app.request('/api/test', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    expect(r1.status).toBe(200);

    const r2 = await app.request('/api/test', {
      headers: { 'x-forwarded-for': '5.6.7.8' },
    });
    expect(r2.status).toBe(200);
  });

  it('same IP shares counter', async () => {
    const app = createTestApp(1, 60);

    await app.request('/api/test', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });

    const r2 = await app.request('/api/test', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    expect(r2.status).toBe(429);
  });

  it('separate limiter instances have independent quotas', async () => {
    const limiterA = createRateLimiter({ max: 2, windowMs: 60000 });
    const limiterB = createRateLimiter({ max: 2, windowMs: 60000 });

    const app = new Hono();
    app.use('/api/a', limiterA);
    app.get('/api/a', (c) => c.json({ ok: true }));
    app.use('/api/b', limiterB);
    app.get('/api/b', (c) => c.json({ ok: true }));

    const ip = '10.0.0.1';
    const headers = { 'x-forwarded-for': ip };

    await app.request('/api/a', { headers });
    await app.request('/api/a', { headers });

    const rA = await app.request('/api/a', { headers });
    expect(rA.status).toBe(429);

    const rB1 = await app.request('/api/b', { headers });
    expect(rB1.status).toBe(200);

    const rB2 = await app.request('/api/b', { headers });
    expect(rB2.status).toBe(200);

    const rB3 = await app.request('/api/b', { headers });
    expect(rB3.status).toBe(429);
  });
});
