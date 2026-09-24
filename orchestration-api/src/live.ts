import { LIVE_STATE_KEY, toRobotState, type RobotState } from './telemetry.js';

export interface LivePipelineDeps {
  store: { hset(key: string, fields: Record<string, string>): Promise<unknown> };
  broadcast(states: RobotState[]): void;
  persist(samples: RobotState[]): void;
  onError(err: unknown, context: Record<string, unknown>): void;
}

/**
 * Collects packets from the Redis channel and flushes them in batches:
 * one HSET for the live cache, one WebSocket frame per dashboard client,
 * one async bulk insert into MongoDB.
 */
export function createLivePipeline(deps: LivePipelineDeps) {
  const latest = new Map<string, RobotState>();
  let samples: RobotState[] = [];

  return {
    ingest(message: string): void {
      try {
        const state = toRobotState(JSON.parse(message));
        latest.set(state.robotId, state);
        samples.push(state);
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
      deps.persist(batch);
    },
  };
}
