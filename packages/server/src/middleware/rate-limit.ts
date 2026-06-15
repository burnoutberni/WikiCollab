import type { Context, Next } from 'hono';
import type { IncomingMessage } from 'http';

import { envInt, envWindow } from '../utils/env.js';
import { getClientIp } from '../utils/ip.js';

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimiterOptions {
  max: number;
  windowMs: number;
  message?: string;
}

export type RateLimiterHandler = ((c: Context, next: Next) => Promise<Response | void>) & {
  reset: () => void;
};

function getConnectionIp(c: Context): string | undefined {
  const incoming = (c.env as { incoming?: IncomingMessage })?.incoming;
  return incoming?.socket?.remoteAddress;
}

function getIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  const realIp = c.req.header('x-real-ip');
  const connectionIp = getConnectionIp(c);
  return getClientIp(forwarded, realIp, connectionIp);
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiterHandler {
  const { max, windowMs, message = 'Too many requests, please try again later' } = opts;
  const store = new Map<string, RateLimitEntry>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, windowMs);
  if (typeof cleanup.unref === 'function') cleanup.unref();

  const handler = async (c: Context, next: Next) => {
    const ip = getIp(c);
    const now = Date.now();
    let entry = store.get(ip);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(ip, entry);
    }
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length >= max) {
      const oldest = entry.timestamps[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: message }, 429);
    }
    entry.timestamps.push(now);
    await next();
  };

  (handler as RateLimiterHandler).reset = () => {
    store.clear();
    clearInterval(cleanup);
  };

  return handler as RateLimiterHandler;
}

const _crud = createRateLimiter({
  max: envInt('RATE_LIMIT_CRUD_MAX', 100),
  windowMs: envWindow('RATE_LIMIT_CRUD_WINDOW', 60),
});

const _push = createRateLimiter({
  max: envInt('RATE_LIMIT_PUSH_MAX', 10),
  windowMs: envWindow('RATE_LIMIT_PUSH_WINDOW', 60),
});

const _preview = createRateLimiter({
  max: envInt('RATE_LIMIT_PREVIEW_MAX', 60),
  windowMs: envWindow('RATE_LIMIT_PREVIEW_WINDOW', 60),
});

export const crudLimiter = _crud;
export const pushLimiter = _push;
export const previewLimiter = _preview;

export function resetRateLimiters(): void {
  _crud.reset();
  _push.reset();
  _preview.reset();
}
