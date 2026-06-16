import type { IncomingMessage } from 'http';

import { getClientIp } from '../utils/ip.js';

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:3001'];

let allowedOrigins: string[] | null = null;

/** Normalizes configured origins so runtime checks are case- and slash-insensitive. */
function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, '').toLowerCase())
    .filter(Boolean);
}

/** Returns the cached allowlist used for HTTP CORS and WS origin checks. */
export function getAllowedOrigins(): string[] {
  if (allowedOrigins !== null) return [...allowedOrigins];

  const env = process.env.CORS_ORIGINS;
  allowedOrigins = env ? parseOrigins(env) : DEFAULT_ORIGINS;
  return [...allowedOrigins];
}

/** Clears cached origin configuration so tests can re-read environment changes. */
export function resetAllowedOrigins(): void {
  allowedOrigins = null;
}

/** Allows blank origins only when no explicit allowlist has been configured. */
export function isOriginAllowed(origin: string): boolean {
  if (!origin) return !process.env.CORS_ORIGINS;
  const allowed = getAllowedOrigins();
  return allowed.includes(origin);
}

/** Logs rejected upgrade requests with the best-effort client IP for debugging. */
export function logRejectedOrigin(req: IncomingMessage, origin: string | undefined): void {
  const fwd = req.headers['x-forwarded-for'];
  const forwardedFor = Array.isArray(fwd) ? fwd[0] : fwd;
  const ri = req.headers['x-real-ip'];
  const realIp = Array.isArray(ri) ? ri[0] : ri;
  const connectionIp = req.socket.remoteAddress;
  const clientIp = getClientIp(forwardedFor, realIp, connectionIp);
  console.warn(`[WS REJECTED] origin=${origin ?? 'none'} ip=${clientIp} url=${req.url}`);
}

/** Creates the `ws` verifyClient callback used to reject unexpected browser origins. */
export function createOriginValidator() {
  return (
    info: { origin: string; req: IncomingMessage; secure: boolean },
    callback: (result: boolean, code?: number, message?: string) => void
  ): void => {
    if (isOriginAllowed(info.origin)) {
      callback(true);
    } else {
      logRejectedOrigin(info.req, info.origin);
      callback(false, 403, 'Forbidden: origin not allowed');
    }
  };
}
