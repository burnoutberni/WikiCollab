import { Hono } from 'hono';

const instances = new Hono();

instances.post('/preview', async (c) => {
  const { wikitext, api_url } = await c.req.json();

  if (api_url) {
    try {
      const formData = new URLSearchParams();
      formData.append('action', 'parse');
      formData.append('text', wikitext || '');
      formData.append('prop', 'text');
      formData.append('contentmodel', 'wikitext');
      formData.append('format', 'json');

      const res = await fetch(api_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      const data = await res.json() as {
        parse?: { text?: { '*': string } };
        error?: { info: string };
      };

      if (data.parse?.text?.['*']) {
        return c.json({ html: data.parse.text['*'] });
      }
    } catch (err) {
      console.error('MediaWiki preview request failed:', err);
      // Fall through to local parsing
    }
  }

  const Parser = (await import('wikiparser-node')).default;
  const root = Parser.parse(wikitext || '');
  const html = root.toHtml();

  return c.json({ html });
});

instances.post('/css', async (c) => {
  const { api_url } = await c.req.json();

  if (!api_url) {
    return c.json({ error: 'api_url is required' }, 400);
  }

  try {
    const siteInfoUrl = `${api_url}?action=query&meta=siteinfo&siprop=skins&format=json`;
    const siteInfoRes = await fetch(siteInfoUrl);
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
        const res = await fetch(url);
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
        console.error(`Failed to fetch CSS page ${page}:`, err);
        // Skip pages that fail to fetch
      }
    }

    return c.json({ css: cssParts.join('\n\n') });
  } catch (err) {
    console.error('Failed to fetch CSS from MediaWiki:', err);
    return c.json({ error: 'Failed to fetch CSS from MediaWiki' }, 500);
  }
});

export default instances;
