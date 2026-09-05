import { logger } from './logging.js';

const MEDIAWIKI_CONTACT =
  process.env.APP_CONTACT_URL || 'https://github.com/burnoutberni/WikiCollab';
export const MEDIAWIKI_USER_AGENT = `WikiCollab/${process.env.APP_VERSION || 'dev'} (MediaWiki preview; ${MEDIAWIKI_CONTACT})`;
const MAX_RETRY_AFTER_MS = 5 * 60_000;

export function mediaWikiHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    'User-Agent': MEDIAWIKI_USER_AGENT,
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
