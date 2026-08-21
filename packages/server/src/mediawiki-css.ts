import { serverFetch, SsrfError } from 'server-fetch';

import { mediaWikiHeaders, readMediaWikiJson } from './mediawiki-http.js';

const MAX_MEDIAWIKI_CSS_BYTES = 500_000;

const RESOURCE_LOADER_MODULES = [
  'mediawiki.skinning.interface',
  'mediawiki.skinning.content',
  'mediawiki.page.gallery.styles',
  'mediawiki.page.media',
  'mediawiki.ui.button',
  'mediawiki.ui.input',
  'ext.cite.styles',
  'ext.wikimediamessages.styles',
];

function getLoadPhpUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  const loadPath = url.pathname.replace(/\/api\.php$/, '/load.php');
  url.pathname = loadPath === url.pathname ? '/w/load.php' : loadPath;
  url.search = '';
  return url.toString();
}

function sanitizeCss(css: string): string {
  return css
    .slice(0, MAX_MEDIAWIKI_CSS_BYTES)
    .replace(/<\/style/gi, '')
    .replace(/@import\b[^;]*(?:;|$)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/url\s*\(\s*['"]?\s*javascript\s*:/gi, 'url(')
    .replace(/-moz-binding\s*:[^;]*(?:;|$)/gi, '')
    .replace(/behavior\s*:[^;]*(?:;|$)/gi, '');
}

async function readCssResponse(
  response: {
    ok?: boolean;
    status?: number;
    headers?: { get?: (name: string) => string | null };
    text: () => Promise<string>;
  },
  context: string
): Promise<string | null> {
  if (response.ok === false) {
    console.warn(`MediaWiki ${context} CSS returned HTTP ${response.status || 'error'}`);
    return null;
  }

  const contentType = response.headers?.get?.('content-type')?.toLowerCase() || '';
  if (contentType && !/(^|;)\s*(text\/css|text\/plain|application\/x-css)\b/.test(contentType)) {
    console.warn(`MediaWiki ${context} CSS returned unexpected content type ${contentType}`);
    return null;
  }

  const css = await response.text();
  if (css.length > MAX_MEDIAWIKI_CSS_BYTES) {
    console.warn(`MediaWiki ${context} CSS exceeded ${MAX_MEDIAWIKI_CSS_BYTES} bytes; truncating`);
  }
  return sanitizeCss(css);
}

/** Fetches common and default-skin MediaWiki CSS for a document-scoped instance. */
export async function fetchMediaWikiCss(apiUrl: string): Promise<string | null> {
  try {
    const siteInfoUrl = `${apiUrl}?action=query&meta=siteinfo&siprop=skins&format=json`;
    const siteInfoRes = await serverFetch(siteInfoUrl, {
      headers: mediaWikiHeaders({ Accept: 'application/json' }),
    });
    const siteInfoData = await readMediaWikiJson<{
      query?: { skins?: Array<{ code: string; name: string; default?: boolean | string }> };
    }>(siteInfoRes, 'siteinfo');

    const defaultSkin = siteInfoData?.query?.skins?.find(
      (skin) => skin.default === true || skin.default === ''
    );
    const skinCode = defaultSkin?.code || 'vector';
    const cssParts: string[] = [];

    try {
      const loadUrl = new URL(getLoadPhpUrl(apiUrl));
      loadUrl.searchParams.set('lang', 'en');
      loadUrl.searchParams.set('skin', skinCode);
      loadUrl.searchParams.set('only', 'styles');
      loadUrl.searchParams.set('modules', RESOURCE_LOADER_MODULES.join('|'));
      const res = await serverFetch(loadUrl.toString(), {
        headers: mediaWikiHeaders({ Accept: 'text/css,*/*;q=0.1' }),
      });
      const css = await readCssResponse(res, 'ResourceLoader');
      if (css?.trim()) cssParts.push(`/* ResourceLoader: ${skinCode} */\n${css}`);
    } catch (err) {
      if (err instanceof SsrfError) throw err;
      console.error('Failed to fetch ResourceLoader CSS:', err);
    }

    for (const page of ['MediaWiki:Common.css', `MediaWiki:${skinCode}.css`]) {
      try {
        const url = `${apiUrl}?action=query&prop=revisions&rvprop=content&titles=${encodeURIComponent(page)}&format=json`;
        const res = await serverFetch(url, {
          headers: mediaWikiHeaders({ Accept: 'application/json' }),
        });
        const data = await readMediaWikiJson<{
          query?: { pages?: Record<string, { revisions?: Array<{ '*': string }> }> };
        }>(res, `CSS page ${page}`);
        const pages = data?.query?.pages;
        const content = pages ? Object.values(pages)[0]?.revisions?.[0]?.['*'] : null;
        if (content) cssParts.push(`/* ${page} */\n${sanitizeCss(content)}`);
      } catch (err) {
        if (err instanceof SsrfError) throw err;
        console.error(`Failed to fetch CSS page ${page}:`, err);
      }
    }

    return cssParts.length > 0 ? cssParts.join('\n\n') : null;
  } catch (err) {
    if (err instanceof SsrfError) {
      console.error(`SSRF blocked: ${err.url}`);
    } else {
      console.error('Failed to fetch CSS from MediaWiki:', err);
    }
    return null;
  }
}
