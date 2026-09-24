import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { WebSocket } from 'ws';
import { createApp } from './app.js';
import { signToken } from './auth.js';
import { LIVE_STATE_KEY, type RobotState } from './telemetry.js';
import { attachFleetSocket, FLEET_SOCKET_PATH } from './ws.js';

const secret = 'test-secret';
const token = signToken({ id: 'u1', email: '', role: 'operator', companyId: 'c1' }, secret);
const cached = [JSON.stringify({ robotId: 'rob-v-1' }), JSON.stringify({ robotId: 'rob-v-2' })];

const app = createApp({
  // Login is not exercised here, so the Prisma client is never touched.
  prisma: {} as PrismaClient,
  cache: {
    async hvals(key) {
      assert.equal(key, LIVE_STATE_KEY);
      return cached;
    },
  },
  jwtSecret: secret,
  corsOrigin: 'http://localhost:3000',
  onError: () => {},
});
const server = app.listen(0);
const broadcast = attachFleetSocket(server, secret);
let base = '';

before(() => {
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
});

test('snapshot requires a bearer token', async () => {
  const res = await fetch(`http://${base}/api/fleet/snapshot`);
  assert.equal(res.status, 401);
});

test('snapshot returns the cached fleet as one array', async () => {
  const res = await fetch(`http://${base}/api/fleet/snapshot`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [{ robotId: 'rob-v-1' }, { robotId: 'rob-v-2' }]);
});

test('fleet socket handshake is refused without a valid token', async () => {
  const ws = new WebSocket(`ws://${base}${FLEET_SOCKET_PATH}?token=forged`);
  const status = await new Promise<number | undefined>((resolve) => {
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
    ws.on('open', () => resolve(101));
  });
  assert.equal(status, 401);
});

test('fleet socket handshake succeeds with a token and receives broadcasts', async () => {
  const ws = new WebSocket(`ws://${base}${FLEET_SOCKET_PATH}?token=${encodeURIComponent(token)}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  const received = new Promise<RobotState[]>((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(String(data)) as RobotState[]));
  });
  broadcast([{ robotId: 'rob-v-1' } as RobotState]);
  assert.deepEqual(await received, [{ robotId: 'rob-v-1' }]);
  ws.close();
});
