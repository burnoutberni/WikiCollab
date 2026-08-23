const MEDIAWIKI_CONTACT =
  process.env.APP_CONTACT_URL || 'https://github.com/burnoutberni/WikiCollab';
export const MEDIAWIKI_USER_AGENT = `WikiCollab/${process.env.APP_VERSION || 'dev'} (MediaWiki preview; ${MEDIAWIKI_CONTACT})`;

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
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
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
    console.warn(
      `MediaWiki ${context} returned HTTP ${response.status || 'error'}${rateLimited ? ' rate limit' : ''}.${bodySnippet ? ` Body: ${bodySnippet}` : ''}`
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
    console.warn(
      `MediaWiki ${context} returned ${contentType || 'non-JSON'}${rateLimited ? ' rate limit' : ''}.${bodySnippet ? ` Body: ${bodySnippet}` : ''}`
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

  try {
    return { data: (await response.json()) as T, rateLimited: false, status: response.status };
  } catch (err) {
    console.warn(
      `MediaWiki ${context} response was not valid JSON.${err instanceof Error ? ` ${err.message}` : ''}`
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
