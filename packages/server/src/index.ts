import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import docsRoutes from './routes/docs.js';
import instancesRoutes from './routes/instances.js';
import { securityHeaders } from './middleware/security-headers.js';
import { crudLimiter, previewLimiter } from './middleware/rate-limit.js';
import { setupWebSocket } from './ws/index.js';
import { getAllowedOrigins } from './ws/origin.js';

const app = new Hono();

app.onError((err, c) => {
  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err);
  return c.json({ error: 'Internal server error' }, 500);
});

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// getAllowedOrigins() is evaluated once at startup; restart the server to apply CORS_ORIGINS changes.
app.use('*', cors({
  origin: getAllowedOrigins(),
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type'],
}));

app.use('/api/*', securityHeaders());

app.use('/api/docs/*', crudLimiter);
app.use('/api/instances/preview', previewLimiter);
app.use('/api/instances/css', previewLimiter);

app.route('/api/docs', docsRoutes);
app.route('/api/instances', instancesRoutes);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './packages/client/dist' }));
  app.get('/*', serveStatic({ path: './packages/client/dist/index.html' }));
}

const port = parseInt(process.env.PORT || '3000', 10);

const server = serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
  console.log(`WebSocket available on ws://localhost:${info.port}/ws`);
});

setupWebSocket(server);
