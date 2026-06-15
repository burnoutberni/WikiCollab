import type { MiddlewareHandler } from 'hono';

export interface SecurityHeadersOptions {
  contentSecurityPolicy?: string;
  strictTransportSecurity?: boolean | string;
  xFrameOptions?: string;
  xContentTypeOptions?: string;
  xXSSProtection?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
}

// 'unsafe-inline' and 'unsafe-eval' are required by the Yjs collaborative editor.
// Remove these if the editor dependency is replaced with a CSP-compatible alternative.
const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const DEFAULT_PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=()';

export function securityHeaders(options: SecurityHeadersOptions = {}): MiddlewareHandler {
  const isProduction = process.env.NODE_ENV === 'production';

  return async (c, next) => {
    await next();

    c.header('X-Content-Type-Options', options.xContentTypeOptions ?? 'nosniff');
    c.header('X-Frame-Options', options.xFrameOptions ?? 'DENY');
    c.header('X-XSS-Protection', options.xXSSProtection ?? '0');
    c.header('Referrer-Policy', options.referrerPolicy ?? 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', options.permissionsPolicy ?? DEFAULT_PERMISSIONS_POLICY);
    c.header('Content-Security-Policy', options.contentSecurityPolicy ?? DEFAULT_CSP);

    if (options.strictTransportSecurity !== false && isProduction) {
      const isHttps =
        c.req.header('x-forwarded-proto') === 'https' || c.req.url.startsWith('https://');

      if (isHttps) {
        const value =
          typeof options.strictTransportSecurity === 'string'
            ? options.strictTransportSecurity
            : 'max-age=63072000; includeSubDomains';
        c.header('Strict-Transport-Security', value);
      }
    }
  };
}
