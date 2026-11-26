import { serverFetch } from 'server-fetch';
import type { WikimediaLanguage, WikimediaSearchResponse, WikimediaSuggestion } from 'shared';

import { mediaWikiHeaders } from '../mediawiki-http.js';
import { WikiImportError } from './wiki-import.js';

interface MatrixSite {
  url: string;
  dbname: string;
  code: string;
  sitename: string;
  private?: unknown;
  closed?: unknown;
}
interface Site {
  api_url: string;
  site_name: string;
  language: string;
}
interface Directory {
  languages: WikimediaLanguage[];
  sites: Site[];
}

const headers = mediaWikiHeaders({ Accept: 'application/json' });
let directory: { value: Directory; expires: number } | undefined;
let loadingDirectory: Promise<Directory> | undefined;
const searches = new Map<string, { value: Promise<WikimediaSearchResponse>; expires: number }>();

/** Wikimedia's authoritative directory supplies language autonyms and actual wiki URLs. */
export async function wikimediaDirectory(): Promise<Directory> {
  if (directory && directory.expires > Date.now()) return directory.value;
  if (loadingDirectory) return loadingDirectory;
  loadingDirectory = (async () => {
    const response = await serverFetch(
      'https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json&formatversion=2&smsiteprop=url%7Cdbname%7Ccode%7Csitename',
      {
        headers,
        timeout: 5000,
        maxResponseSize: 1024 * 1024,
      }
    );
    if (!response.ok)
      throw new WikiImportError(
        'Wikipedia search is unavailable. You can still paste an article URL.'
      );
    const data = (await response.json()) as { sitematrix?: Record<string, unknown> };
    if (!data.sitematrix)
      throw new WikiImportError(
        'Could not load Wikipedia languages. Try again or paste an article URL.'
      );
    const value: Directory = { languages: [], sites: [] };
    const add = (site: MatrixSite, language: string) => {
      if (site.code !== 'wiki' || 'private' in site) return;
      const url = new URL(site.url);
      // The directory is trusted, but do not turn remote metadata into an arbitrary proxy.
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.wikipedia.org')) return;
      value.sites.push({
        api_url: new URL('/w/api.php', url).toString(),
        site_name: site.sitename,
        language,
      });
    };
    for (const [key, entry] of Object.entries(data.sitematrix)) {
      if (
        key !== 'specials' &&
        entry &&
        typeof entry === 'object' &&
        'code' in entry &&
        'site' in entry
      ) {
        const language = entry as {
          code: string;
          name: string;
          localname: string;
          site: MatrixSite[];
        };
        const before = value.sites.length;
        for (const site of language.site) add(site, language.code);
        if (value.sites.length > before)
          value.languages.push({
            code: language.code,
            name: language.localname || language.name,
            autonym: language.name,
          });
      }
    }
    value.languages.sort((a, b) => a.name.localeCompare(b.name));
    if (!value.languages.length)
      throw new WikiImportError('No Wikipedia languages available. Paste an article URL instead.');
    directory = { value, expires: Date.now() + 6 * 60 * 60_000 };
    return value;
  })();
  try {
    return await loadingDirectory;
  } finally {
    loadingDirectory = undefined;
  }
}

async function searchSite(site: Site, query: string): Promise<WikimediaSuggestion[]> {
  const url = new URL(site.api_url);
  url.search = new URLSearchParams({
    action: 'query',
    generator: 'prefixsearch',
    gpssearch: query,
    gpslimit: '10',
    prop: 'info',
    format: 'json',
    formatversion: '2',
  }).toString();
  const response = await serverFetch(url.toString(), {
    headers,
    timeout: 3500,
    maxResponseSize: 128 * 1024,
  });
  if (!response.ok) throw new Error('Search unavailable');
  const data = (await response.json()) as {
    batchcomplete?: boolean;
    error?: unknown;
    query?: {
      pages?: Array<{ title: string; pageid: number; contentmodel: string; index: number }>;
    };
  };
  if (data.error || (!Array.isArray(data.query?.pages) && !data.batchcomplete))
    throw new Error('Invalid search response');
  // Use Wikimedia's completion ranking, and never suggest structured entities or shared-only files.
  return (data.query?.pages ?? [])
    .filter((page) => page.pageid > 0 && page.contentmodel === 'wikitext')
    .sort((a, b) => a.index - b.index)
    .map(({ title }) => ({ ...site, title }));
}

/** Search only the chosen Wikipedia language edition. URL imports support other projects. */
export async function searchWikimedia(
  query: string,
  language: string
): Promise<WikimediaSearchResponse> {
  const key = JSON.stringify([language, query.trim().toLowerCase()]);
  const cached = searches.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = (async () => {
    const catalog = await wikimediaDirectory();
    const site = catalog.sites.find((site) => site.language === language);
    if (!site) throw new WikiImportError('Choose an available Wikipedia language.');
    try {
      return { results: await searchSite(site, query), partial: false };
    } catch {
      throw new WikiImportError(
        'Wikipedia search is unavailable. Try again or paste an article URL.'
      );
    }
  })();
  if (searches.size >= 100) searches.delete(searches.keys().next().value!);
  searches.set(key, { value, expires: Date.now() + 30_000 });
  try {
    return await value;
  } catch (error) {
    searches.delete(key);
    throw error;
  }
}

export function resetWikimediaSearchForTest() {
  directory = undefined;
  loadingDirectory = undefined;
  searches.clear();
}
