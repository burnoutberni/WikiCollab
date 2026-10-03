import type { MediaWikiUrlMetadata } from 'shared';
import { serverFetch } from 'server-fetch';

import { logger } from './logging.js';
import { mediaWikiHeaders, readMediaWikiJson } from './mediawiki-http.js';

function getApiUrl(apiUrl: string, params: Record<string, string>): string {
  const url = new URL(apiUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function fetchMediaWikiUrlMetadata(apiUrl: string): Promise<MediaWikiUrlMetadata> {
  try {
    const res = await serverFetch(
      getApiUrl(apiUrl, {
        action: 'query',
        meta: 'siteinfo',
        siprop: 'general',
        format: 'json',
      }),
      { headers: mediaWikiHeaders({ Accept: 'application/json' }) }
    );
    const data = await readMediaWikiJson<{
      query?: { general?: { server?: unknown; articlepath?: unknown; scriptpath?: unknown } };
    }>(res, 'siteinfo general');
    const general = data?.query?.general;
    return {
      server: nonEmptyString(general?.server),
      articlePath: nonEmptyString(general?.articlepath),
      scriptPath: nonEmptyString(general?.scriptpath),
    };
  } catch (err) {
    logger.warn(
      { apiUrl, err: err instanceof Error ? err.message : String(err) },
      'Failed to fetch MediaWiki URL metadata'
    );
    return { server: null, articlePath: null, scriptPath: null };
  }
}
