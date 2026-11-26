import { serverFetch } from 'server-fetch';
import type { WikiArticle, WikiImportRequest, WikiSearchResponse } from 'shared';

import { mediaWikiHeaders } from '../mediawiki-http.js';
import { readMediaWikiUrlMetadata } from '../mediawiki-siteinfo.js';

const FETCH_OPTIONS = {
  headers: mediaWikiHeaders({ Accept: 'application/json, text/html;q=0.9' }),
  timeout: 8000,
  maxResponseSize: 2 * 1024 * 1024,
};

export class WikiImportError extends Error {}

function publicUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new WikiImportError('Use a public HTTP(S) wiki URL without credentials.');
  }
  url.hash = '';
  // Wikimedia mobile links use the same API as the desktop site.
  if (
    /\.(?:wikipedia|wiktionary|wikibooks|wikiquote|wikisource|wikinews|wikiversity|wikivoyage|wikimedia|wikidata|wikifunctions)\.org$/.test(
      url.hostname
    )
  ) {
    url.hostname = url.hostname.replace(/\.m\./, '.');
  }
  return url;
}

async function queryApi(apiUrl: string, params: Record<string, string>) {
  const url = publicUrl(apiUrl);
  url.search = '';
  for (const [key, value] of Object.entries({ ...params, format: 'json', formatversion: '2' })) {
    url.searchParams.set(key, value);
  }
  const response = await serverFetch(url.toString(), FETCH_OPTIONS);
  if (!response.ok) {
    throw new WikiImportError(
      response.status === 429
        ? 'The wiki is rate limiting requests. Please try again later.'
        : 'The wiki API is unavailable or requires authentication.'
    );
  }
  const data = await response.json();
  if (!data || typeof data !== 'object' || !('query' in data) || 'error' in data) {
    throw new WikiImportError('The wiki API could not read this page without authentication.');
  }
  return data.query as {
    general?: { sitename?: string; server?: string; articlepath?: string; scriptpath?: string };
    specialpagealiases?: Array<{ realname: string; aliases: string[] }>;
    namespaces?: Record<string, { name?: string; canonical?: string }>;
    namespacealiases?: Array<{ id: number; alias: string }>;
    search?: Array<{ title: string }>;
    pages?: Array<{
      title: string;
      missing?: boolean;
      invalid?: boolean;
      revisions?: Array<{
        revid: number;
        timestamp: string;
        contentmodel?: string;
        content?: string;
        slots?: { main?: { contentmodel?: string; content?: string } };
      }>;
    }>;
  };
}

async function inspectApi(apiUrl: string) {
  const url = publicUrl(apiUrl);
  url.search = '';
  const api = url.toString();
  const result = await queryApi(api, {
    action: 'query',
    meta: 'siteinfo',
    siprop: 'general|specialpagealiases|namespaces|namespacealiases',
  });
  if (!result.general || typeof result.general.sitename !== 'string') {
    throw new WikiImportError('This URL does not expose a public MediaWiki API.');
  }
  const permalinkAliases = ['PermanentLink', 'Redirect'];
  const specialNamespaces = ['Special'];
  const specialNamespace = result.namespaces?.['-1'];
  if (specialNamespace?.name) specialNamespaces.push(specialNamespace.name);
  for (const namespace of result.namespacealiases || []) {
    if (namespace.id === -1) specialNamespaces.push(namespace.alias);
  }
  for (const special of result.specialpagealiases || []) {
    if (['PermanentLink', 'Redirect'].includes(special.realname))
      permalinkAliases.push(...special.aliases);
  }
  return {
    api_url: api,
    site_name: result.general.sitename,
    permalinkAliases,
    specialNamespaces,
    ...readMediaWikiUrlMetadata(result.general, api),
  };
}

/** Discover standard installs and the EditURI advertised by custom short-URL installs. */
async function discoverWiki(value: string, explicitApi?: string) {
  const url = publicUrl(value);
  if (explicitApi) return { site: await inspectApi(explicitApi), articleUrl: url };
  if (url.pathname.endsWith('/api.php'))
    return { site: await inspectApi(url.toString()), articleUrl: url };
  const candidates = new Set<string>();
  if (url.pathname.endsWith('/index.php')) candidates.add(new URL('api.php', url).toString());
  candidates.add(new URL('/w/api.php', url).toString());
  candidates.add(new URL('/api.php', url).toString());
  for (const candidate of candidates) {
    try {
      return { site: await inspectApi(candidate), articleUrl: url };
    } catch {
      /* Try the next bounded discovery candidate. */
    }
  }
  const response = await serverFetch(url.toString(), FETCH_OPTIONS);
  if (!response.ok)
    throw new WikiImportError('Could not load this wiki. Check the article URL and try again.');
  const articleUrl = publicUrl(response.url || url.toString());
  const html = await response.text();
  for (const link of html.match(/<link\b[^>]*>/gi) || []) {
    if (!/\brel\s*=\s*["']EditURI["']/i.test(link)) continue;
    const href = link.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const apiUrl = new URL(href.replace(/&amp;/g, '&'), articleUrl);
    apiUrl.search = '';
    return { site: await inspectApi(apiUrl.toString()), articleUrl };
  }
  throw new WikiImportError('Could not discover this wiki’s API. Try its canonical article URL.');
}

function urlSelection(
  url: URL,
  articlePath: string | null,
  aliases: string[],
  namespaces: string[]
) {
  const oldid = url.searchParams.get('oldid');
  const path = url.searchParams.get('title') || decodeURIComponent(url.pathname);
  const permalink = path.match(/(?:^|\/)([^/:]+):([^/]+)\/(?:revision\/)?(\d+)\/?$/i);
  const normalize = (value: string) => value.replace(/_/g, ' ').toLowerCase();
  const permalinkId =
    permalink &&
    namespaces.some((namespace) => normalize(namespace) === normalize(permalink[1])) &&
    aliases.some((alias) => normalize(alias) === normalize(permalink[2]))
      ? permalink[3]
      : null;
  let revision: number | undefined;
  if (oldid !== null || permalinkId) {
    const raw = oldid ?? permalinkId!;
    revision = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(revision) || revision <= 0) {
      throw new WikiImportError('The URL contains an invalid revision ID.');
    }
  }
  let title = url.searchParams.get('title') || undefined;
  if (!title && articlePath?.includes('$1')) {
    const [prefix, suffix] = articlePath.split('$1');
    if (!prefix.includes('?') && url.pathname.startsWith(prefix) && url.pathname.endsWith(suffix)) {
      title = decodeURIComponent(
        url.pathname.slice(prefix.length, suffix ? -suffix.length : undefined)
      ).replace(/_/g, ' ');
    }
  }
  return { title, revision };
}

export async function searchWiki(wiki: string, search: string): Promise<WikiSearchResponse> {
  const { site } = await discoverWiki(wiki);
  const result = await queryApi(site.api_url, {
    action: 'query',
    list: 'search',
    srsearch: search,
    srlimit: '10',
    srprop: '',
  });
  if (!Array.isArray(result.search))
    throw new WikiImportError('This wiki does not support article search.');
  return {
    api_url: site.api_url,
    site_name: site.site_name,
    results: result.search.map(({ title }) => ({ title })),
  };
}

export async function importWikiArticle(input: WikiImportRequest): Promise<WikiArticle> {
  const { site, articleUrl } = await discoverWiki(input.url || input.api_url!, input.api_url);
  const selection = input.url
    ? urlSelection(articleUrl, site.articlePath, site.permalinkAliases, site.specialNamespaces)
    : { title: undefined, revision: undefined };
  const revision = selection.revision ?? input.revision_id;
  const title = selection.title ?? input.title;
  if (!revision && !title)
    throw new WikiImportError(
      'No article title found. Paste an article URL or search for a title.'
    );
  const result = await queryApi(site.api_url, {
    action: 'query',
    prop: 'revisions',
    rvprop: 'ids|timestamp|content|contentmodel',
    rvslots: 'main',
    ...(revision ? { revids: String(revision) } : { titles: title!, redirects: '1' }),
  });
  const page = result.pages?.[0];
  const rev = page?.revisions?.[0];
  if (!page || page.missing || page.invalid || !rev || (revision && rev.revid !== revision)) {
    throw new WikiImportError(
      'The article or requested revision is missing, deleted, or not publicly readable.'
    );
  }
  const slot = rev.slots?.main ?? rev;
  if (slot.contentmodel !== 'wikitext' || typeof slot.content !== 'string') {
    throw new WikiImportError(
      'Only publicly readable wikitext pages can be imported. This page uses another content model or its text is hidden.'
    );
  }
  if (!Number.isSafeInteger(rev.revid) || rev.revid <= 0 || typeof rev.timestamp !== 'string') {
    throw new WikiImportError('The wiki returned invalid revision metadata.');
  }
  const sourceUrl = new URL('index.php', site.api_url);
  sourceUrl.searchParams.set('title', page.title);
  sourceUrl.searchParams.set('oldid', String(rev.revid));
  return {
    api_url: site.api_url,
    site_name: site.site_name,
    server: site.server,
    articlePath: site.articlePath,
    scriptPath: site.scriptPath,
    title: page.title,
    content: slot.content,
    source: {
      url: sourceUrl.toString(),
      title: page.title,
      revision_id: rev.revid,
      timestamp: rev.timestamp,
    },
  };
}
