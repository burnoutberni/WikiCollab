import { Hono } from 'hono';
import { serverFetch, SsrfError } from 'server-fetch';

interface SourceMapEntry {
  sourceLine: number;
  blockIndex: number;
}

const instances = new Hono();

function generateSourceMap(root: ReturnType<Awaited<typeof import('wikiparser-node')>['default']['parse']>): SourceMapEntry[] {
  const sourceMap: SourceMapEntry[] = [];
  let blockIndex = 0;

  for (const child of root.childNodes) {
    if (child.type === 'text') {
      const text = child.toString().trim();
      if (!text) continue;
    }
    const rect = child.getBoundingClientRect();
    if (rect.height === 0) continue;
    sourceMap.push({
      sourceLine: rect.top,
      blockIndex,
    });
    blockIndex++;
  }

  return sourceMap;
}

instances.post('/preview', async (c) => {
  const { wikitext, api_url, page } = await c.req.json();

  const Parser = (await import('wikiparser-node')).default;
  const root = Parser.parse(wikitext || '', page || 'API');
  const sourceMap = generateSourceMap(root);

  if (api_url) {
    try {
      const formData = new URLSearchParams();
      formData.append('action', 'parse');
      formData.append('text', wikitext || '');
      formData.append('prop', 'text');
      formData.append('contentmodel', 'wikitext');
      formData.append('format', 'json');
      if (page) {
        formData.append('title', page);
      }

      const res = await serverFetch(api_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      const data = await res.json() as {
        parse?: { text?: { '*': string } };
        error?: { info: string };
      };

      if (data.parse?.text?.['*']) {
        return c.json({ html: data.parse.text['*'], sourceMap });
      }
    } catch (err) {
      if (err instanceof SsrfError) {
        console.error(`SSRF blocked: ${err.url}`);
        return c.json({ error: 'Request blocked by security policy' }, 400);
      }
      console.error('MediaWiki preview request failed:', err);
    }
  }

  const html = Parser.toHtml(wikitext || '', false, undefined, page || undefined);
  return c.json({ html, sourceMap });
});

instances.post('/css', async (c) => {
  const { api_url } = await c.req.json();

  if (!api_url) {
    return c.json({ error: 'api_url is required' }, 400);
  }

  try {
    const siteInfoUrl = `${api_url}?action=query&meta=siteinfo&siprop=skins&format=json`;
    const siteInfoRes = await serverFetch(siteInfoUrl);
    const siteInfoData = await siteInfoRes.json() as {
      query?: { skins?: Array<{ code: string; name: string; default?: boolean }> };
    };

    const defaultSkin = siteInfoData.query?.skins?.find((s) => s.default === true);
    const skinCode = defaultSkin?.code || 'vector';

    const pages = ['MediaWiki:Common.css', `MediaWiki:${skinCode}.css`];
    const cssParts: string[] = [];

    for (const page of pages) {
      try {
        const url = `${api_url}?action=query&prop=revisions&rvprop=content&titles=${encodeURIComponent(page)}&format=json`;
        const res = await serverFetch(url);
        const data = await res.json() as {
          query?: { pages?: Record<string, { revisions?: Array<{ '*': string }> }> };
        };

        const pagesObj = data.query?.pages;
        if (pagesObj) {
          const pageData = Object.values(pagesObj)[0];
          const content = pageData?.revisions?.[0]?.['*'];
          if (content) {
            cssParts.push(`/* ${page} */\n${content}`);
          }
        }
      } catch (err) {
        if (err instanceof SsrfError) {
          console.error(`SSRF blocked for CSS page ${page}`);
        } else {
          console.error(`Failed to fetch CSS page ${page}:`, err);
        }
      }
    }

    return c.json({ css: cssParts.join('\n\n') });
  } catch (err) {
    if (err instanceof SsrfError) {
      console.error(`SSRF blocked: ${err.url}`);
      return c.json({ error: 'Request blocked by security policy' }, 400);
    }
    console.error('Failed to fetch CSS from MediaWiki:', err);
    return c.json({ error: 'Failed to fetch CSS from MediaWiki' }, 500);
  }
});

export default instances;
