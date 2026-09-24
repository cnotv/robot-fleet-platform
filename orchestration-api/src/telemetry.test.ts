import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLivePipeline, type PersistedSample } from './live.js';
import { LIVE_STATE_KEY, TelemetryMappingError, toRobotState, type RobotState } from './telemetry.js';

const wirePacket = {
  robot_id: 'rob-v-10049',
  status: 'active',
  telemetry: { latitude: 48.1351, longitude: 11.582, speed_mps: 1.2, battery_pct: 84.5 },
  current_task: 'floor_scrub_zone_b',
  timestamp: '2026-09-24T00:00:00Z',
  ingested_at: '2026-09-24T00:00:00.120Z',
};

test('maps the snake_case wire packet to the camelCase domain model', () => {
  assert.deepEqual(toRobotState(wirePacket), {
    robotId: 'rob-v-10049',
    status: 'active',
    latitude: 48.1351,
    longitude: 11.582,
    speedMps: 1.2,
    batteryPct: 84.5,
    currentTask: 'floor_scrub_zone_b',
    timestamp: '2026-09-24T00:00:00.000Z',
    ingestedAt: '2026-09-24T00:00:00.120Z',
  });
});

test('rejects packets that break the contract', () => {
  const broken = [
    null,
    { ...wirePacket, status: 'exploded' },
    { ...wirePacket, telemetry: { ...wirePacket.telemetry, battery_pct: 101 } },
    { ...wirePacket, telemetry: { ...wirePacket.telemetry, latitude: '48' } },
    { ...wirePacket, timestamp: 'yesterday' },
  ];
  for (const packet of broken) {
    assert.throws(() => toRobotState(packet), TelemetryMappingError);
  }
});

test('pipeline caches the latest state per robot and persists only changes and heartbeats', async () => {
  const hashes: Record<string, string>[] = [];
  const broadcasts: RobotState[][] = [];
  const persisted: PersistedSample[][] = [];
  const errors: unknown[] = [];
  const pipeline = createLivePipeline({
    store: {
      async hset(key, fields) {
        assert.equal(key, LIVE_STATE_KEY);
        hashes.push(fields);
      },
    },
    broadcast: (s) => broadcasts.push(s),
    persist: (s) => persisted.push(s),
    onError: (e) => errors.push(e),
  });
  const at = (seconds: number, patch: Record<string, unknown> = {}) =>
    JSON.stringify({ ...wirePacket, timestamp: new Date(Date.parse(wirePacket.timestamp) + seconds * 1000).toISOString(), ...patch });

  pipeline.ingest(at(0));
  pipeline.ingest(at(1, { telemetry: { ...wirePacket.telemetry, battery_pct: 80 } }));
  pipeline.ingest(at(2, { status: 'error' }));
  pipeline.ingest(at(3, { status: 'error', current_task: 'dock_charging' }));
  pipeline.ingest(at(13, { status: 'error', current_task: 'dock_charging' }));
  pipeline.ingest('not json');
  await pipeline.flush();
  await pipeline.flush();

  assert.equal(errors.length, 1);
  assert.equal(hashes.length, 1, 'second flush with nothing pending is a no op');
  assert.equal(JSON.parse(hashes[0]!['rob-v-10049']!).currentTask, 'dock_charging');
  assert.equal(broadcasts[0]!.length, 1);
  assert.deepEqual(
    persisted[0]!.map((s) => s.event),
    ['task_started', 'status_changed', 'task_started', 'heartbeat'],
    'an unchanged sample one second later is not persisted',
  );
});
