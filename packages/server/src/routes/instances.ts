import { Hono } from 'hono';
import { serverFetch, SsrfError } from 'server-fetch';
import { PreviewSchema, CssSchema } from 'shared';
import { parseAndValidate } from '../middleware/validate.js';
import { generatePreview } from '../preview.js';

const instances = new Hono();

instances.post('/preview', async (c) => {
  const result = await parseAndValidate(c, PreviewSchema);
  if (!result.success) return result.response;
  const { wikitext, api_url, page } = result.data;

  try {
    const { html, sourceMap } = await generatePreview(wikitext, api_url, page);
    return c.json({ html, sourceMap });
  } catch (err) {
    console.error('Preview generation failed:', err);
    return c.json({ html: '<p class="text-red-500">Failed to generate preview</p>', sourceMap: [] });
  }
});

instances.post('/css', async (c) => {
  const result = await parseAndValidate(c, CssSchema);
  if (!result.success) return result.response;
  const { api_url } = result.data;

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
          throw err;
        } else {
          console.error(`Failed to fetch CSS page ${page}:`, err);
        }
      }
    }

    return c.json({ css: cssParts.join('\n\n') });
  } catch (err) {
    if (err instanceof SsrfError) {
      console.error(`SSRF blocked: ${err.url}`);
    } else {
      console.error('Failed to fetch CSS from MediaWiki:', err);
    }
    return c.json({ error: 'Failed to fetch from MediaWiki' }, 500);
  }
});

export default instances;
