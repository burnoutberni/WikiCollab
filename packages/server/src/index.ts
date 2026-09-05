import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { logger } from './logging.js';
import { crudLimiter, previewLimiter } from './middleware/rate-limit.js';
import { securityHeaders } from './middleware/security-headers.js';
import docsRoutes from './routes/docs.js';
import { setupWebSocket } from './ws/index.js';
import { getAllowedOrigins } from './ws/origin.js';

const app = new Hono();

app.onError((err, c) => {
  logger.error(
    { method: c.req.method, path: c.req.path, err: err.message, stack: err.stack },
    'Unhandled error'
  );
  return c.json({ error: 'Internal server error' }, 500);
});

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  await next();
  logger.info(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration: Date.now() - start,
    },
    'HTTP request'
  );
});

// getAllowedOrigins() is evaluated once at startup; restart the server to apply CORS_ORIGINS changes.
app.use(
  '*',
  cors({
    origin: getAllowedOrigins(),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['Content-Type'],
  })
);

app.use('/api/*', securityHeaders());

app.use('/api/docs/*', crudLimiter);
app.use('/api/docs/:id/preview', previewLimiter);

app.route('/api/docs', docsRoutes);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', version: process.env.APP_VERSION || '0.0.0' });
});

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './packages/client/dist' }));
  app.get('/*', serveStatic({ path: './packages/client/dist/index.html' }));
}

const port = parseInt(process.env.PORT || '3000', 10);

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info({ port: info.port, version: process.env.APP_VERSION || '0.0.0' }, 'Server running');
    logger.info({ port: info.port }, 'WebSocket available');
  }
);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close();
});

setupWebSocket(server);
