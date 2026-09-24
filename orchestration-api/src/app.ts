import express, { type ErrorRequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authRouter, requireAuth } from './auth.js';
import { fleetRouter, ValidationError, type FleetDeps } from './fleet.js';

export interface AppDeps extends FleetDeps {
  prisma: PrismaClient;
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
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
  app.use('/api', requireAuth(deps.jwtSecret), fleetRouter(deps));

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'invalid JSON body' });
      return;
    }
    deps.onError(err, { source: 'http', method: req.method, path: req.path });
    res.status(500).json({ error: 'internal error' });
  };
  app.use(errorHandler);

  return app;
}
