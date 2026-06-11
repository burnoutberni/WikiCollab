import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { createServer } from 'http';
import docsRoutes from './routes/docs.js';
import instancesRoutes from './routes/instances.js';
import { setupWebSocket } from './ws/index.js';

const app = new Hono();

app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3001'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type'],
}));

app.route('/api/docs', docsRoutes);
app.route('/api/instances', instancesRoutes);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

const port = parseInt(process.env.PORT || '3000');

const server = serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
  console.log(`WebSocket available on ws://localhost:${info.port}/ws`);
});

setupWebSocket(server);
