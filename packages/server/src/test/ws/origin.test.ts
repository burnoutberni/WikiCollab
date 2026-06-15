import type { IncomingMessage } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createOriginValidator,
  getAllowedOrigins,
  isOriginAllowed,
  logRejectedOrigin,
  resetAllowedOrigins,
} from '../../ws/origin.js';

function mockReq(url = '/ws'): IncomingMessage {
  return {
    url,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
}

describe('WebSocket origin validation', () => {
  beforeEach(() => {
    resetAllowedOrigins();
    delete process.env.CORS_ORIGINS;
  });

  describe('getAllowedOrigins', () => {
    it('returns default origins when CORS_ORIGINS is not set', () => {
      const origins = getAllowedOrigins();
      expect(origins).toEqual(['http://localhost:5173', 'http://localhost:3001']);
    });

    it('parses CORS_ORIGINS from environment variable', () => {
      process.env.CORS_ORIGINS = 'https://example.com, https://app.example.com';
      const origins = getAllowedOrigins();
      expect(origins).toEqual(['https://example.com', 'https://app.example.com']);
    });

    it('trims whitespace from parsed origins', () => {
      process.env.CORS_ORIGINS = '  https://a.com , https://b.com  ';
      const origins = getAllowedOrigins();
      expect(origins).toEqual(['https://a.com', 'https://b.com']);
    });

    it('filters out empty entries', () => {
      process.env.CORS_ORIGINS = 'https://a.com,,,https://b.com,';
      const origins = getAllowedOrigins();
      expect(origins).toEqual(['https://a.com', 'https://b.com']);
    });

    it('returns a new array on each call (no shared reference)', () => {
      const first = getAllowedOrigins();
      const second = getAllowedOrigins();
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    });

    it('does not leak mutations back to the cache', () => {
      const origins = getAllowedOrigins();
      origins.push('https://injected.com');
      expect(getAllowedOrigins()).not.toContain('https://injected.com');
    });
  });

  describe('isOriginAllowed', () => {
    it('allows undefined origin in development (no CORS_ORIGINS set)', () => {
      expect(isOriginAllowed(undefined as unknown as string)).toBe(true);
    });

    it('rejects undefined origin when CORS_ORIGINS is configured', () => {
      process.env.CORS_ORIGINS = 'https://trusted.com';
      expect(isOriginAllowed(undefined as unknown as string)).toBe(false);
    });

    it('allows default origins in development', () => {
      expect(isOriginAllowed('http://localhost:5173')).toBe(true);
      expect(isOriginAllowed('http://localhost:3001')).toBe(true);
    });

    it('rejects unknown origins', () => {
      expect(isOriginAllowed('https://evil.com')).toBe(false);
    });

    it('allows configured origins from env', () => {
      process.env.CORS_ORIGINS = 'https://trusted.com';
      expect(isOriginAllowed('https://trusted.com')).toBe(true);
      expect(isOriginAllowed('http://localhost:5173')).toBe(false);
    });
  });

  describe('createOriginValidator', () => {
    it('calls callback with true for allowed origin', () => {
      const validator = createOriginValidator();
      const cb = vi.fn();

      validator({ origin: 'http://localhost:5173', req: mockReq(), secure: true }, cb);

      expect(cb).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('calls callback with false for disallowed origin', () => {
      const validator = createOriginValidator();
      const cb = vi.fn();

      validator({ origin: 'https://evil.com', req: mockReq(), secure: true }, cb);

      expect(cb).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledWith(false, 403, 'Forbidden: origin not allowed');
    });

    it('allows connections with no origin header in development', () => {
      const validator = createOriginValidator();
      const cb = vi.fn();

      validator({ origin: '', req: mockReq(), secure: true }, cb);

      expect(cb).toHaveBeenCalledWith(true);
    });

    it('rejects connections with no origin header when CORS_ORIGINS is set', () => {
      process.env.CORS_ORIGINS = 'https://trusted.com';
      const validator = createOriginValidator();
      const cb = vi.fn();

      validator({ origin: '', req: mockReq(), secure: true }, cb);

      expect(cb).toHaveBeenCalledWith(false, 403, 'Forbidden: origin not allowed');
    });

    it('logs rejected connections', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const validator = createOriginValidator();
      const cb = vi.fn();
      const req = mockReq('/ws/doc-123');

      validator({ origin: 'https://attacker.com', req, secure: true }, cb);

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain('[WS REJECTED]');
      expect(warnSpy.mock.calls[0][0]).toContain('origin=https://attacker.com');
      expect(warnSpy.mock.calls[0][0]).toContain('url=/ws/doc-123');

      warnSpy.mockRestore();
    });

    it('logs the resolved client IP', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const req = {
        url: '/ws',
        headers: { 'x-forwarded-for': '10.0.0.1' },
        socket: { remoteAddress: '172.16.0.1' },
      } as unknown as IncomingMessage;

      logRejectedOrigin(req, 'https://attacker.com');

      expect(warnSpy.mock.calls[0][0]).toContain('172.16.0.1');
      warnSpy.mockRestore();
    });
  });
});
