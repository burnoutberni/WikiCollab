export interface MediaWikiUrlMetadata {
  server: string | null;
  articlePath: string | null;
  scriptPath: string | null;
}

function titleForArticlePath(title: string): string {
  return encodeURIComponent(title.replaceAll(' ', '_'));
}

function fallbackPageUrl(apiUrl: string, title: string): string | null {
  try {
    const url = new URL(apiUrl);
    if (!/\/api\.php$/.test(url.pathname)) return null;
    const pathPrefix = url.pathname
      .replace(/\/w\/api\.php$/, '/wiki/')
      .replace(/\/api\.php$/, '/wiki/');
    url.pathname = `${pathPrefix}${titleForArticlePath(title)}`;
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

function fallbackEditUrl(apiUrl: string, title: string): string | null {
  try {
    const url = new URL(apiUrl);
    if (!/\/api\.php$/.test(url.pathname)) return null;
    url.pathname = url.pathname.replace(/\/api\.php$/, '/index.php');
    url.search = '';
    url.searchParams.set('title', title);
    url.searchParams.set('action', 'edit');
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeServer(server: string | null | undefined): string | null {
  if (!server) return null;
  try {
    const url = new URL(server);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.pathname = url.pathname.replace(/\/$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function buildMediaWikiPageUrl(
  apiUrl: string | null,
  title: string,
  metadata?: MediaWikiUrlMetadata | null
): string | null {
  const server = normalizeServer(metadata?.server);
  if (server && metadata?.articlePath?.includes('$1')) {
    try {
      return new URL(
        metadata.articlePath.replace('$1', titleForArticlePath(title)),
        server
      ).toString();
    } catch {
      // Fall through to legacy derivation.
    }
  }
  return apiUrl ? fallbackPageUrl(apiUrl, title) : null;
}

export function buildMediaWikiEditUrl(
  apiUrl: string | null,
  title: string,
  metadata?: MediaWikiUrlMetadata | null
): string | null {
  const server = normalizeServer(metadata?.server);
  if (server && metadata?.scriptPath !== null && metadata?.scriptPath !== undefined) {
    try {
      const scriptPath = metadata.scriptPath.replace(/\/$/, '');
      const url = new URL(`${scriptPath}/index.php`, server);
      url.searchParams.set('title', title);
      url.searchParams.set('action', 'edit');
      return url.toString();
    } catch {
      // Fall through to legacy derivation.
    }
  }
  return apiUrl ? fallbackEditUrl(apiUrl, title) : null;
}

export function absolutizeMediaWikiUrl(value: string, server: string | null | undefined): string {
  const canonicalServer = normalizeServer(server);
  if (!canonicalServer || !value || value.startsWith('#')) return value;
  if (/^(?:[a-z][a-z0-9+.-]*:)/i.test(value) && !/^https?:/i.test(value)) return value;
  try {
    return new URL(value, canonicalServer).toString();
  } catch {
    return value;
  }
}
