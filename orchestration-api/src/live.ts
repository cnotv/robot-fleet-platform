import { LIVE_STATE_KEY, toRobotState, type RobotState } from './telemetry.js';

/** Why a sample was written to the telemetry buffer. Reports count these. */
export type SampleEvent = 'task_started' | 'status_changed' | 'heartbeat';
export type PersistedSample = RobotState & { event: SampleEvent };

/** A robot that keeps its task and status is persisted at most this often. */
export const HEARTBEAT_MS = 10_000;

export interface LivePipelineDeps {
  store: { hset(key: string, fields: Record<string, string>): Promise<unknown> };
  broadcast(states: RobotState[]): void;
  persist(samples: PersistedSample[]): void;
  onError(err: unknown, context: Record<string, unknown>): void;
}

/**
 * Collects packets from the Redis channel and flushes them in batches:
 * one HSET for the live cache, one WebSocket frame per dashboard client,
 * one async bulk insert into MongoDB.
 *
 * MongoDB receives changes plus a heartbeat per robot, not every packet:
 * 1,000 robots at 1Hz would otherwise write 86 million documents a day.
 */
export function createLivePipeline(deps: LivePipelineDeps) {
  const latest = new Map<string, RobotState>();
  const lastPersisted = new Map<string, { at: number; status: string; task: string }>();
  let samples: PersistedSample[] = [];

  function eventFor(state: RobotState): SampleEvent | null {
    const prev = lastPersisted.get(state.robotId);
    const at = Date.parse(state.timestamp);
    let event: SampleEvent | null = null;
    if (!prev || prev.task !== state.currentTask) event = 'task_started';
    else if (prev.status !== state.status) event = 'status_changed';
    else if (at - prev.at >= HEARTBEAT_MS) event = 'heartbeat';
    if (event) lastPersisted.set(state.robotId, { at, status: state.status, task: state.currentTask });
    return event;
  }

  return {
    ingest(message: string): void {
      try {
        const state = toRobotState(JSON.parse(message));
        latest.set(state.robotId, state);
        const event = eventFor(state);
        if (event) samples.push({ ...state, event });
      } catch (err) {
        deps.onError(err, { source: 'live-pipeline', message: message.slice(0, 512) });
      }
    },

    async flush(): Promise<void> {
      if (latest.size === 0) return;
      const states = [...latest.values()];
      const batch = samples;
      latest.clear();
      samples = [];

      await deps.store.hset(
        LIVE_STATE_KEY,
        Object.fromEntries(states.map((s) => [s.robotId, JSON.stringify(s)])),
      );
      deps.broadcast(states);
      if (batch.length > 0) deps.persist(batch);
    },
  };
}
