import './load-env.js';

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { logger } from './logging.js';
import { authMiddleware } from './middleware/auth.js';
import { crudLimiter, previewLimiter } from './middleware/rate-limit.js';
import { securityHeaders } from './middleware/security-headers.js';
import authRoutes from './routes/auth.js';
import docsRoutes from './routes/docs.js';
import { startRuntimeMemoryLogging } from './runtime-memory-logging.js';
import { setupWebSocket } from './ws/index.js';
import { getAllowedOrigins } from './ws/origin.js';

const app = new Hono();

const requiredEnv = [
  'OAUTH_CONSUMER_KEY',
  'OAUTH_CONSUMER_SECRET',
  'OAUTH_CALLBACK_URL',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
];
const missing = requiredEnv.filter((key) => !process.env[key]);
const key = process.env.ENCRYPTION_KEY || '';
const invalidKey = !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(key) || Buffer.from(key, 'base64').length !== 32;
if (missing.length > 0 || invalidKey) {
  logger.fatal(
    { missing, invalidEncryptionKey: invalidKey },
    'Missing required environment variables. Set them in .env or export them before starting the server.'
  );
  process.exit(1);
}

app.onError((err, c) => {
  const getCtx = c.get as unknown as (key: string) => unknown;
  const requestId = getCtx('requestId') as string | undefined;
  logger.error(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    },
    'Unhandled error'
  );
  return c.json({ error: 'Internal server error' }, 500);
});

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  const setCtx = c.set as unknown as (key: string, value: unknown) => void;
  setCtx('requestId', requestId);
  const start = Date.now();
  await next();
  const getCtx = c.get as unknown as (key: string) => unknown;
  logger.info(
    {
      requestId: getCtx('requestId') as string,
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
    credentials: true,
  })
);

app.use('/api/*', securityHeaders());
app.use('/api/*', authMiddleware);
app.use('/auth/*', securityHeaders());
app.use('/auth/*', authMiddleware);

app.use('/api/docs/*', crudLimiter);
app.use('/api/docs/:id/preview', previewLimiter);

app.route('/api/docs', docsRoutes);
app.route('/auth', authRoutes);

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
    logger.info({ port: info.port }, 'Server running');
    logger.info({ port: info.port }, 'WebSocket available');
  }
);

const wss = setupWebSocket(server);
const memoryLoggingTimer = startRuntimeMemoryLogging();

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  if (memoryLoggingTimer) clearInterval(memoryLoggingTimer);
  const shutdownDeadline = setTimeout(() => {
    logger.warn('Shutdown deadline reached, force-closing remaining WebSocket clients');
    wss.clients.forEach((client) => {
      try {
        client.terminate();
      } catch {
        /* ignore */
      }
    });
  }, 5000);
  wss.clients.forEach((client) => {
    try {
      client.close(1001, 'Server shutting down');
    } catch {
      /* ignore */
    }
  });
  server.close(() => {
    clearTimeout(shutdownDeadline);
    logger.info('Server shut down');
  });
});
