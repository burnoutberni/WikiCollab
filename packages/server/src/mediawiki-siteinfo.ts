import { serverFetch } from 'server-fetch';
import type { MediaWikiUrlMetadata } from 'shared';

import { logger } from './logging.js';
import { mediaWikiHeaders, readMediaWikiJson } from './mediawiki-http.js';

function getApiUrl(apiUrl: string, params: Record<string, string>): string {
  const url = new URL(apiUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export interface MediaWikiUrlMetadataResult extends MediaWikiUrlMetadata {
  fetched: boolean;
}

export const emptyMediaWikiUrlMetadata: MediaWikiUrlMetadataResult = {
  server: null,
  articlePath: null,
  scriptPath: null,
  fetched: false,
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeServer(value: unknown, apiUrl: string): string | null {
  const server = nonEmptyString(value);
  if (!server) return null;
  try {
    const url = new URL(server, apiUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.pathname = url.pathname.replace(/\/$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function readMediaWikiUrlMetadata(
  general: { server?: unknown; articlepath?: unknown; scriptpath?: unknown } | undefined,
  apiUrl: string
): MediaWikiUrlMetadataResult {
  if (!general) return emptyMediaWikiUrlMetadata;
  return {
    server: normalizeServer(general?.server, apiUrl),
    articlePath: nonEmptyString(general?.articlepath),
    scriptPath: typeof general?.scriptpath === 'string' ? general.scriptpath : null,
    fetched: true,
  };
}

export async function fetchMediaWikiUrlMetadata(
  apiUrl: string
): Promise<MediaWikiUrlMetadataResult> {
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
    if (!data) return emptyMediaWikiUrlMetadata;
    return readMediaWikiUrlMetadata(data.query?.general, apiUrl);
  } catch (err) {
    logger.warn(
      { apiUrl, err: err instanceof Error ? err.message : String(err) },
      'Failed to fetch MediaWiki URL metadata'
    );
    return emptyMediaWikiUrlMetadata;
  }
}
