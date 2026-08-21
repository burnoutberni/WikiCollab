export const MEDIAWIKI_USER_AGENT = `WikiCollab/${process.env.APP_VERSION || 'dev'} (MediaWiki preview; local development)`;

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
}

function isRateLimitResponse(status: number | undefined, body: string): boolean {
  return (
    status === 429 ||
    /rate\s*limit|too many requests|you are mak/i.test(body)
  );
}

export async function readMediaWikiJsonResult<T>(
  response: {
    ok?: boolean;
    status?: number;
    headers?: { get?: (name: string) => string | null };
    json: () => Promise<unknown>;
    text?: () => Promise<string>;
  },
  context: string
): Promise<MediaWikiJsonResult<T>> {
  if (response.ok === false) {
    const body = response.text ? await response.text().catch(() => '') : '';
    const bodySnippet = body.slice(0, 120);
    const rateLimited = isRateLimitResponse(response.status, body);
    console.warn(
      `MediaWiki ${context} returned HTTP ${response.status || 'error'}${rateLimited ? ' rate limit' : ''}.${bodySnippet ? ` Body: ${bodySnippet}` : ''}`
    );
    return { data: null, rateLimited, status: response.status, bodySnippet };
  }

  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType && !contentType.toLowerCase().includes('json')) {
    const body = response.text ? await response.text().catch(() => '') : '';
    const bodySnippet = body.slice(0, 120);
    const rateLimited = isRateLimitResponse(response.status, body);
    console.warn(
      `MediaWiki ${context} returned ${contentType || 'non-JSON'}${rateLimited ? ' rate limit' : ''}.${bodySnippet ? ` Body: ${bodySnippet}` : ''}`
    );
    return { data: null, rateLimited, status: response.status, bodySnippet };
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
  response: Parameters<typeof readMediaWikiJsonResult<T>>[0],
  context: string
): Promise<T | null> {
  const result = await readMediaWikiJsonResult<T>(response, context);
  return result.data;
}
