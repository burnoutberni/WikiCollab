import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

const instances = new Hono();

function getWikiArticleBase(apiUrl: string): string {
  return apiUrl.replace(/\/w\/api\.php$/, '/wiki/');
}

instances.post('/preview', async (c) => {
  const { wikitext, instance_id } = await c.req.json();

  if (instance_id) {
    const instance = db.select()
      .from(schema.mediawikiInstances)
      .where(eq(schema.mediawikiInstances.id, instance_id))
      .get();

    if (instance?.api_url) {
      try {
        const formData = new URLSearchParams();
        formData.append('action', 'parse');
        formData.append('text', wikitext || '');
        formData.append('prop', 'text');
        formData.append('contentmodel', 'wikitext');
        formData.append('format', 'json');

        const res = await fetch(instance.api_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });

        const data = await res.json() as {
          parse?: { text?: { '*': string } };
          error?: { info: string };
        };

        if (data.parse?.text?.['*']) {
          return c.json({ html: data.parse.text['*'], css: instance.css || null });
        }
      } catch {
        // Fall through to local parsing
      }
    }
  }

  // Fallback: local parsing without template resolution
  const Parser = (await import('wikiparser-node')).default;
  const root = Parser.parse(wikitext || '');
  const html = root.toHtml();

  let css: string | null = null;
  if (instance_id) {
    const instance = db.select()
      .from(schema.mediawikiInstances)
      .where(eq(schema.mediawikiInstances.id, instance_id))
      .get();
    css = instance?.css || null;
  }

  return c.json({ html, css });
});

async function fetchWikiCss(apiUrl: string): Promise<string> {
  const siteInfoUrl = `${apiUrl}?action=query&meta=siteinfo&siprop=skins&format=json`;
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
      const url = `${apiUrl}?action=query&prop=revisions&rvprop=content&titles=${encodeURIComponent(page)}&format=json`;
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
    } catch {
      // Skip pages that fail to fetch
    }
  }

  return cssParts.join('\n\n');
}

instances.post('/:id/css', async (c) => {
  const id = c.req.param('id');

  const instance = db.select()
    .from(schema.mediawikiInstances)
    .where(eq(schema.mediawikiInstances.id, id))
    .get();

  if (!instance) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  try {
    const css = await fetchWikiCss(instance.api_url);

    db.update(schema.mediawikiInstances)
      .set({ css })
      .where(eq(schema.mediawikiInstances.id, id))
      .run();

    return c.json({ success: true, css });
  } catch (error) {
    return c.json({ error: 'Failed to fetch CSS from MediaWiki' }, 500);
  }
});

instances.get('/', (c) => {
  const allInstances = db.select().from(schema.mediawikiInstances).all();
  return c.json(allInstances);
});

instances.post('/', async (c) => {
  const body = await c.req.json();
  const id = nanoid(7);
  const now = new Date().toISOString();

  const instance = {
    id,
    name: body.name,
    api_url: body.api_url,
    token: body.token || null,
    configured_at: now,
  };

  db.insert(schema.mediawikiInstances).values(instance).run();
  return c.json(instance, 201);
});

instances.delete('/:id', (c) => {
  const id = c.req.param('id');
  const result = db.delete(schema.mediawikiInstances)
    .where(eq(schema.mediawikiInstances.id, id))
    .run();

  if (result.changes === 0) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  return c.json({ success: true });
});

export default instances;
