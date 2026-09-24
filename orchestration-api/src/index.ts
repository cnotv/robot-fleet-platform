import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { ensureAdmin } from './auth.js';
import { createLivePipeline } from './live.js';
import { logError, TelemetrySample } from './mongo.js';
import { TELEMETRY_CHANNEL } from './telemetry.js';
import { attachFleetSocket } from './ws.js';

const FLUSH_INTERVAL_MS = 250;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing environment variable ${name}`);
  return value;
}

const port = Number(process.env.PORT ?? 4000);
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const jwtSecret = required('JWT_SECRET');

const prisma = new PrismaClient();
const cache = new Redis(redisUrl);
// A connection in subscriber mode cannot run other commands, so it gets its own.
const subscriber = new Redis(redisUrl);

await mongoose.connect(required('MONGO_URL'));
await ensureAdmin(prisma, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);

const app = createApp({
  prisma,
  cache,
  jwtSecret,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  onError: logError,
});
const server = app.listen(port, () => console.log(`orchestration api listening on :${port}`));
const broadcast = attachFleetSocket(server, jwtSecret);

const pipeline = createLivePipeline({
  store: cache,
  broadcast,
  persist: (samples) => {
    TelemetrySample.insertMany(samples, { ordered: false }).catch((err: unknown) =>
      logError(err, { source: 'telemetry-buffer', count: samples.length }),
    );
  },
  onError: logError,
});

subscriber.on('message', (_channel: string, message: string) => pipeline.ingest(message));
await subscriber.subscribe(TELEMETRY_CHANNEL);

const flushTimer = setInterval(() => {
  pipeline.flush().catch((err: unknown) => logError(err, { source: 'live-pipeline' }));
}, FLUSH_INTERVAL_MS);

async function shutdown(): Promise<void> {
  clearInterval(flushTimer);
  server.close();
  await Promise.allSettled([subscriber.quit(), cache.quit(), prisma.$disconnect(), mongoose.disconnect()]);
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
