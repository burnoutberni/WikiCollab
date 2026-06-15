import { describe, it, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { securityHeaders } from '../../middleware/security-headers.js';

function createTestApp() {
  const app = new Hono();
  app.use('/api/*', securityHeaders());
  app.get('/api/test', (c) => c.json({ ok: true }));
  return app;
}

describe('Security Headers middleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets all required security headers on /api routes', async () => {
    const app = createTestApp();
    const res = await app.request('/api/test');

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('0');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it('does not set HSTS in non-production', async () => {
    const app = createTestApp();
    const res = await app.request('/api/test', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('does not apply headers to non-/api routes', async () => {
    const app = new Hono();
    app.use('/api/*', securityHeaders());
    app.get('/other', (c) => c.json({ ok: true }));
    const res = await app.request('/other');

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBeNull();
    expect(res.headers.get('X-Frame-Options')).toBeNull();
  });

  it('allows custom CSP via options', async () => {
    const app = new Hono();
    app.use('/api/*', securityHeaders({ contentSecurityPolicy: "default-src 'none'" }));
    app.get('/api/test', (c) => c.json({ ok: true }));
    const res = await app.request('/api/test');

    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'");
  });

  it('allows disabling HSTS via options', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = new Hono();
    app.use('/api/*', securityHeaders({ strictTransportSecurity: false }));
    app.get('/api/test', (c) => c.json({ ok: true }));
    const res = await app.request('/api/test', {
      headers: { 'x-forwarded-proto': 'https' },
    });

    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('sets HSTS in production over HTTPS by default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = createTestApp();
    const res = await app.request('/api/test', {
      headers: { 'x-forwarded-proto': 'https' },
    });

    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains'
    );
  });

  it('does not set HSTS over HTTP even in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = createTestApp();
    const res = await app.request('/api/test');

    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('sets HSTS when URL scheme is https://', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = createTestApp();
    const res = await app.request('https://localhost/api/test');

    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains'
    );
  });

  it('allows custom HSTS value via string option', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = new Hono();
    app.use('/api/*', securityHeaders({ strictTransportSecurity: 'max-age=3600' }));
    app.get('/api/test', (c) => c.json({ ok: true }));
    const res = await app.request('/api/test', {
      headers: { 'x-forwarded-proto': 'https' },
    });

    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=3600');
  });
});
