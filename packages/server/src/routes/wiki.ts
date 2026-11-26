import { Hono } from 'hono';
import { WikiImportSchema, WikiSearchSchema } from 'shared';

import { currentUserId } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { parseAndValidate } from '../middleware/validate.js';
import { importWikiArticle, searchWiki, WikiImportError } from '../services/wiki-import.js';
import { searchWikimedia, wikimediaDirectory } from '../services/wikimedia-search.js';

const wiki = new Hono();
wiki.use('*', async (c, next) => {
  if (!currentUserId(c)) return c.json({ error: 'Authentication required' }, 401);
  await next();
});
wiki.use('*', createRateLimiter({ max: 60, windowMs: 60_000 }));
wiki.onError((error, c) =>
  c.json(
    {
      error:
        error instanceof WikiImportError
          ? error.message
          : 'Could not reach a public wiki API. Check the URL and try again.',
    },
    400
  )
);
wiki.post('/search', async (c) => {
  const result = await parseAndValidate(c, WikiSearchSchema);
  if (!result.success) return result.response;
  const { wiki, query, language } = result.data;
  return c.json(wiki ? await searchWiki(wiki, query) : await searchWikimedia(query, language));
});
wiki.get('/languages', async (c) => c.json((await wikimediaDirectory()).languages));
wiki.post('/resolve', async (c) => {
  const result = await parseAndValidate(c, WikiImportSchema);
  if (!result.success) return result.response;
  return c.json(await importWikiArticle(result.data));
});
export default wiki;
