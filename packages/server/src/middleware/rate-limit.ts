import type { Context, Next } from 'hono';

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
}

interface RateLimitOptions {
  max: number;
  windowMs: number;
  message?: string;
}

function getIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const remote = c.req.header('x-real-ip');
  if (remote) return remote;
  return 'unknown';
}

const inMemoryStore = new Map<string, RateLimitEntry>();

export function createRateLimiter(opts: RateLimitOptions) {
  const { max, windowMs, message = 'Too many requests, please try again later' } = opts;

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of inMemoryStore) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) {
        inMemoryStore.delete(key);
      }
    }
  }, windowMs);
  if (typeof cleanup.unref === 'function') cleanup.unref();

  return async (c: Context, next: Next) => {
    const ip = getIp(c);
    const now = Date.now();
    let entry = inMemoryStore.get(ip);
    if (!entry) {
      entry = { timestamps: [] };
      inMemoryStore.set(ip, entry);
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
}

function envInt(key: string, def: number): number {
  const val = process.env[key];
  if (val === undefined) return def;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? def : parsed;
}

function envWindow(key: string, def: number): number {
  return envInt(key, def) * 1000;
}

export const crudLimiter = createRateLimiter({
  max: envInt('RATE_LIMIT_CRUD_MAX', 100),
  windowMs: envWindow('RATE_LIMIT_CRUD_WINDOW', 60),
});

export const pushLimiter = createRateLimiter({
  max: envInt('RATE_LIMIT_PUSH_MAX', 10),
  windowMs: envWindow('RATE_LIMIT_PUSH_WINDOW', 60),
});

export const previewLimiter = createRateLimiter({
  max: envInt('RATE_LIMIT_PREVIEW_MAX', 60),
  windowMs: envWindow('RATE_LIMIT_PREVIEW_WINDOW', 60),
});

export function resetRateLimiters(): void {
  inMemoryStore.clear();
}
