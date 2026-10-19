import { serverFetch, SsrfError } from 'server-fetch';

import { logger } from './logging.js';

const MEDIAWIKI_CONTACT =
  process.env.APP_CONTACT_URL || 'https://github.com/burnoutberni/WikiCollab';
export const MEDIAWIKI_USER_AGENT = `WikiCollab/${process.env.APP_VERSION || 'dev'} (MediaWiki preview; ${MEDIAWIKI_CONTACT})`;
const MAX_RETRY_AFTER_MS = 5 * 60_000;

export type MediaWikiAuth = string | { cookie: string } | null;

/** Never attach credentials to a non-TLS MediaWiki endpoint. */
export function assertCredentialTransport(apiUrl: string, auth?: MediaWikiAuth): void {
  if (auth && new URL(apiUrl).protocol !== 'https:') {
    throw new Error('Authenticated MediaWiki requests require HTTPS');
  }
}

export function mediaWikiHeaders(
  headers: Record<string, string> = {},
  accessToken?: MediaWikiAuth
): Record<string, string> {
  return {
    'User-Agent': MEDIAWIKI_USER_AGENT,
    ...(typeof accessToken === 'string' && accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {}),
    ...(accessToken && typeof accessToken !== 'string' ? { Cookie: accessToken.cookie } : {}),
    ...headers,
  };
}

export interface MediaWikiJsonResult<T> {
  data: T | null;
  rateLimited: boolean;
  status?: number;
  bodySnippet?: string;
  retryAfterMs?: number;
}

type MediaWikiJsonResponse = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

function isRateLimitResponse(status: number | undefined, body: string): boolean {
  return status === 429 || /"code"\s*:\s*"ratelimited"|too many requests/i.test(body);
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.min(Math.max(0, dateMs - Date.now()), MAX_RETRY_AFTER_MS);
  return undefined;
}

export async function readMediaWikiJsonResult<T>(
  response: MediaWikiJsonResponse,
  context: string
): Promise<MediaWikiJsonResult<T>> {
  if (response.ok === false) {
    const body = await response.text().catch(() => '');
    const bodySnippet = body.slice(0, 120);
    const rateLimited = isRateLimitResponse(response.status, body);
    logger.warn(
      { context, status: response.status, rateLimited, bodySnippet },
      'MediaWiki request failed'
    );
    return {
      data: null,
      rateLimited,
      status: response.status,
      bodySnippet,
      retryAfterMs: rateLimited
        ? parseRetryAfterMs(response.headers?.get?.('retry-after'))
        : undefined,
    };
  }

  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType && !contentType.toLowerCase().includes('json')) {
    const body = await response.text().catch(() => '');
    const bodySnippet = body.slice(0, 120);
    const rateLimited = isRateLimitResponse(response.status, body);
    logger.warn({ context, contentType, rateLimited, bodySnippet }, 'MediaWiki returned non-JSON');
    return {
      data: null,
      rateLimited,
      status: response.status,
      bodySnippet,
      retryAfterMs: rateLimited
        ? parseRetryAfterMs(response.headers?.get?.('retry-after'))
        : undefined,
    };
  }

  try {
    return { data: (await response.json()) as T, rateLimited: false, status: response.status };
  } catch (err) {
    logger.warn(
      { context, err: err instanceof Error ? err.message : String(err) },
      'MediaWiki response was not valid JSON'
    );
    return { data: null, rateLimited: false, status: response.status };
  }
}

export async function readMediaWikiJson<T>(
  response: MediaWikiJsonResponse,
  context: string
): Promise<T | null> {
  const result = await readMediaWikiJsonResult<T>(response, context);
  return result.data;
}

/**
 * Validates that a MediaWiki instance is reachable and that the supplied bearer
 * token (e.g. a bot password) is accepted. Uses a lightweight siteinfo request.
 */
export async function validateMediaWikiConfig(
  apiUrl: string,
  accessToken?: MediaWikiAuth
): Promise<{ ok: boolean; error?: string; status?: number }> {
  assertCredentialTransport(apiUrl, accessToken);
  let res: MediaWikiJsonResponse;
  try {
    const url = new URL(apiUrl);
    url.searchParams.set('action', 'query');
    url.searchParams.set('meta', 'siteinfo');
    url.searchParams.set('siprop', 'general');
    url.searchParams.set('format', 'json');
    res = await serverFetch(url.toString(), {
      ...(accessToken ? { redirect: 'manual' as const } : {}),
      headers: mediaWikiHeaders({ Accept: 'application/json' }, accessToken),
    });
  } catch (err) {
    if (err instanceof SsrfError) {
      return { ok: false, error: 'MediaWiki instance URL is blocked.', status: 0 };
    }
    return { ok: false, error: 'Unable to reach MediaWiki instance.', status: undefined };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const rateLimited = res.status === 429 || /ratelimited|too many requests/i.test(body);
    if (rateLimited) {
      return {
        ok: false,
        error: 'MediaWiki instance is rate limited. Try again later.',
        status: 429,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: 'Invalid MediaWiki API key or insufficient permissions.',
        status: res.status,
      };
    }
    return {
      ok: false,
      error: `MediaWiki instance returned HTTP ${res.status}.`,
      status: res.status,
    };
  }

  const contentType = res.headers?.get?.('content-type') || '';
  if (!contentType.includes('json')) {
    return { ok: false, error: 'MediaWiki instance did not return JSON.', status: res.status };
  }

  const data = await res.json().catch(() => null);
  if (
    !data ||
    typeof data !== 'object' ||
    !('query' in data) ||
    typeof data.query !== 'object' ||
    !data.query ||
    !('general' in data.query) ||
    !(data.query as { general?: unknown }).general
  ) {
    return {
      ok: false,
      error: 'MediaWiki instance did not return usable site info.',
      status: res.status,
    };
  }

  return { ok: true };
}
