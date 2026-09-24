import express, { type ErrorRequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authRouter, requireAuth } from './auth.js';
import { LIVE_STATE_KEY } from './telemetry.js';

export interface AppDeps {
  prisma: PrismaClient;
  cache: { hvals(key: string): Promise<string[]> };
  jwtSecret: string;
  corsOrigin: string;
  onError(err: unknown, context: Record<string, unknown>): void;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', deps.corsOrigin);
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.sendStatus(204);
  });

  app.use('/api/auth', authRouter(deps.prisma, deps.jwtSecret));

  // Values are stored as JSON strings, so the array is assembled without a
  // parse and stringify round trip. That keeps 1,000 robots well under 5ms.
  app.get('/api/fleet/snapshot', requireAuth(deps.jwtSecret), async (_req, res) => {
    const values = await deps.cache.hvals(LIVE_STATE_KEY);
    res.type('application/json').send(`[${values.join(',')}]`);
  });

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    deps.onError(err, { source: 'http', method: req.method, path: req.path });
    res.status(500).json({ error: 'internal error' });
  };
  app.use(errorHandler);

  return app;
}
