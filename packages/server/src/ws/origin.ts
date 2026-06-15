import type { IncomingMessage } from 'http';

import { getClientIp } from '../utils/ip.js';

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:3001'];

let allowedOrigins: string[] | null = null;

function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, '').toLowerCase())
    .filter(Boolean);
}

export function getAllowedOrigins(): string[] {
  if (allowedOrigins !== null) return [...allowedOrigins];

  const env = process.env.CORS_ORIGINS;
  allowedOrigins = env ? parseOrigins(env) : DEFAULT_ORIGINS;
  return [...allowedOrigins];
}

export function resetAllowedOrigins(): void {
  allowedOrigins = null;
}

export function isOriginAllowed(origin: string): boolean {
  if (!origin) return !process.env.CORS_ORIGINS;
  const allowed = getAllowedOrigins();
  return allowed.includes(origin);
}

export function logRejectedOrigin(req: IncomingMessage, origin: string | undefined): void {
  const forwardedFor = req.headers['x-forwarded-for'] as string | undefined;
  const realIp = req.headers['x-real-ip'] as string | undefined;
  const connectionIp = req.socket.remoteAddress;
  const clientIp = getClientIp(forwardedFor, realIp, connectionIp);
  console.warn(`[WS REJECTED] origin=${origin ?? 'none'} ip=${clientIp} url=${req.url}`);
}

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
