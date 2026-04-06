import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import 'dotenv/config';

import projectRoutes from './routes/projects.js';
import pipelineRoutes from './routes/pipeline.js';
import settingsRoutes from './routes/settings.js';

const app = new Hono();

app.use('*', cors());

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.route('/api/projects', projectRoutes);
app.route('/api/projects', pipelineRoutes);
app.route('/api/settings', settingsRoutes);

const port = Number(process.env.PORT) || 3000;

console.log(`Server starting on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;
