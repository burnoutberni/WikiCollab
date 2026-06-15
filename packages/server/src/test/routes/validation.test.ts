import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import * as schema from '../../db/schema.js';
import { createTestDb } from '../setup.js';

const { mockDbModule } = vi.hoisted(() => ({
  mockDbModule: { db: null as any, schema: null as any },
}));
vi.mock('../../db/index.js', () => mockDbModule);

const { mockServerFetch } = vi.hoisted(() => ({
  mockServerFetch: vi.fn(),
}));
vi.mock('server-fetch', () => ({
  serverFetch: mockServerFetch,
  SsrfError: class SsrfError extends Error {
    url: string;
    constructor(url: string) {
      super(`SSRF blocked: ${url}`);
      this.url = url;
    }
  },
}));

import docsRoutes from '../../routes/docs.js';
import instancesRoutes from '../../routes/instances.js';

describe('Input validation', () => {
  let app: Hono;
  let closeDb: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    const testDb = createTestDb();
    mockDbModule.db = testDb.db;
    mockDbModule.schema = schema;
    closeDb = testDb.close;

    app = new Hono();
    app.route('/api/docs', docsRoutes);
  });

  afterEach(() => {
    closeDb?.();
    closeDb = undefined;
  });

  describe('POST /api/docs', () => {
    it('rejects invalid JSON body', async () => {
      const res = await app.request('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{{{',
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid JSON in request body');
    });

    it('rejects slug with invalid characters', async () => {
      const res = await app.request('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'has spaces!' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'slug' }),
        ])
      );
    });

    it('rejects title that is too long', async () => {
      const res = await app.request('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x'.repeat(501) }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
    });

    it('accepts valid body', async () => {
      const res = await app.request('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Valid Title', slug: 'valid-slug' }),
      });
      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /api/docs/:id', () => {
    it('rejects invalid JSON body', async () => {
      const createRes = await app.request('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.id).toBeDefined();

      const res = await app.request(`/api/docs/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid JSON in request body');
    });

    it('rejects title that is too long', async () => {
      const createRes = await app.request('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.id).toBeDefined();

      const res = await app.request(`/api/docs/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x'.repeat(501) }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
    });

    it('accepts valid body', async () => {
      const createRes = await app.request('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.id).toBeDefined();

      const res = await app.request(`/api/docs/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/docs/:id/push', () => {
    it('rejects invalid JSON body', async () => {
      const createRes = await app.request('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.id).toBeDefined();

      const res = await app.request(`/api/docs/${created.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid JSON in request body');
    });

    it('rejects missing api_url', async () => {
      const createRes = await app.request('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.id).toBeDefined();

      const res = await app.request(`/api/docs/${created.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'abc' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'api_url' }),
        ])
      );
    });

    it('rejects missing token', async () => {
      const createRes = await app.request('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.id).toBeDefined();

      const res = await app.request(`/api/docs/${created.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_url: 'https://example.com/w/api.php' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'token' }),
        ])
      );
    });

    it('rejects invalid api_url format', async () => {
      const createRes = await app.request('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.id).toBeDefined();

      const res = await app.request(`/api/docs/${created.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_url: 'not-a-url', token: 'abc' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
    });
  });

  let instancesApp: Hono;
  let closeInstancesDb: (() => void) | undefined;

  function setupInstancesApp() {
    vi.clearAllMocks();
    const testDb = createTestDb();
    mockDbModule.db = testDb.db;
    mockDbModule.schema = schema;
    closeInstancesDb = testDb.close;

    instancesApp = new Hono();
    instancesApp.route('/api/instances', instancesRoutes);
  }

  describe('POST /api/instances/preview', () => {
    beforeEach(setupInstancesApp);

    afterEach(() => {
      closeInstancesDb?.();
      closeInstancesDb = undefined;
    });

    it('rejects invalid JSON body', async () => {
      const res = await instancesApp.request('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{{{',
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid JSON in request body');
    });

    it('rejects invalid api_url format', async () => {
      const res = await instancesApp.request('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_url: 'not-a-url' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
    });

    it('accepts empty body (all fields optional)', async () => {
      const res = await instancesApp.request('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
    });

    it('accepts valid body', async () => {
      const res = await instancesApp.request('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'Hello', page: 'Test' }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/instances/css', () => {
    beforeEach(setupInstancesApp);

    afterEach(() => {
      closeInstancesDb?.();
      closeInstancesDb = undefined;
    });

    it('rejects invalid JSON body', async () => {
      const res = await instancesApp.request('/api/instances/css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{{{',
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid JSON in request body');
    });

    it('rejects missing api_url', async () => {
      const res = await instancesApp.request('/api/instances/css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'api_url' }),
        ])
      );
    });

    it('rejects invalid api_url format', async () => {
      const res = await instancesApp.request('/api/instances/css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_url: 'not-a-url' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
    });

    it('accepts valid body', async () => {
      mockServerFetch
        .mockResolvedValueOnce({
          json: async () => ({
            query: { skins: [{ code: 'vector', name: 'Vector', default: true }] },
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            query: {
              pages: { '1': { revisions: [{ '*': 'body { color: red; }' }] } },
            },
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            query: {
              pages: { '1': { revisions: [{ '*': 'a { color: blue; }' }] } },
            },
          }),
        });

      const res = await instancesApp.request('/api/instances/css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_url: 'https://example.com/w/api.php' }),
      });
      expect(res.status).toBe(200);
    });
  });
});
