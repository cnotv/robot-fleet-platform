import { create } from 'zustand';
import { fetchSnapshot, FLEET_SOCKET_URL, UnauthorizedError, type RobotState } from './api';

/** Socket frames are buffered and committed to React state at most this often. */
export const FLUSH_MS = 300;
const RECONNECT_MS = 2000;

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'unauthorized';

interface FleetStore {
  robots: Record<string, RobotState>;
  connection: ConnectionState;
  lastFlushAt: number;
  /** Loads the snapshot, opens the live socket and returns a disconnect function. */
  connect(token: string): () => void;
}

/** Merges updates, ignoring any that are older than what is already held. */
export function applyUpdates(robots: Record<string, RobotState>, updates: RobotState[]): Record<string, RobotState> {
  const next = { ...robots };
  for (const u of updates) {
    const prev = next[u.robotId];
    if (!prev || Date.parse(u.timestamp) >= Date.parse(prev.timestamp)) next[u.robotId] = u;
  }
  return next;
}

export const useFleet = create<FleetStore>()((set) => ({
  robots: {},
  connection: 'idle',
  lastFlushAt: 0,

  connect(token) {
    let buffer: RobotState[] = [];
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const flush = () => {
      if (buffer.length === 0) return;
      const batch = buffer;
      buffer = [];
      set((s) => ({ robots: applyUpdates(s.robots, batch), lastFlushAt: Date.now() }));
    };
    const flushTimer = setInterval(flush, FLUSH_MS);

    const open = () => {
      socket = new WebSocket(`${FLEET_SOCKET_URL}?token=${encodeURIComponent(token)}`);
      socket.onopen = () => set({ connection: 'open' });
      socket.onmessage = (event: MessageEvent<string>) => {
        buffer.push(...(JSON.parse(event.data) as RobotState[]));
      };
      socket.onclose = () => {
        if (stopped) return;
        set({ connection: 'reconnecting' });
        reconnectTimer = setTimeout(start, RECONNECT_MS);
      };
    };

    // Every (re)connect reloads the snapshot, which resyncs missed frames and
    // surfaces an expired token as a 401 the socket handshake cannot report.
    const start = () =>
      fetchSnapshot(token)
        .then((snapshot) => {
          if (stopped) return;
          buffer.push(...snapshot);
          flush();
          open();
        })
        .catch((err: unknown) => {
          if (stopped) return;
          if (err instanceof UnauthorizedError) {
            set({ connection: 'unauthorized' });
            return;
          }
          set({ connection: 'reconnecting' });
          reconnectTimer = setTimeout(start, RECONNECT_MS);
        });

    set({ connection: 'connecting' });
    void start();

    return () => {
      stopped = true;
      clearInterval(flushTimer);
      clearTimeout(reconnectTimer);
      socket?.close();
      set({ connection: 'idle' });
    };
  },
}));
