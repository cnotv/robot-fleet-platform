import { create } from 'zustand';
import {
  api,
  fleetSocketUrl,
  tokenRole,
  UnauthorizedError,
  type RobotInfo,
  type RobotInput,
  type RobotState,
  type Role,
  type Site,
} from './api';

/** Socket frames are buffered and committed to React state at most this often. */
export const FLUSH_MS = 300;
const RECONNECT_MS = 2000;

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'unauthorized';

interface FleetStore {
  token: string | null;
  role: Role;
  robots: Record<string, RobotState>;
  sites: Record<string, Site>;
  inventory: Record<string, RobotInfo>;
  inventoryLoaded: boolean;
  connection: ConnectionState;
  /** Loads inventory and snapshot, opens the live socket and returns a disconnect function. */
  connect(token: string): () => void;
  createRobot(input: RobotInput): Promise<RobotInfo>;
  updateRobot(id: string, patch: Partial<Omit<RobotInput, 'id'>>): Promise<RobotInfo>;
  deleteRobot(id: string): Promise<void>;
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

const byId = <T extends { id: string }>(items: T[]) => Object.fromEntries(items.map((i) => [i.id, i]));

export const useFleet = create<FleetStore>()((set, get) => {
  const authed = () => {
    const token = get().token;
    if (!token) throw new UnauthorizedError('Not signed in');
    return token;
  };
  const guard = async <T>(call: Promise<T>): Promise<T> => {
    try {
      return await call;
    } catch (err) {
      if (err instanceof UnauthorizedError) set({ connection: 'unauthorized' });
      throw err;
    }
  };

  return {
    token: null,
    role: 'viewer',
    robots: {},
    sites: {},
    inventory: {},
    inventoryLoaded: false,
    connection: 'idle',

    connect(token) {
      set({ token, role: tokenRole(token) });
      let buffer: RobotState[] = [];
      let socket: WebSocket | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
      let stopped = false;

      const flush = () => {
        if (buffer.length === 0) return;
        const batch = buffer;
        buffer = [];
        set((s) => ({ robots: applyUpdates(s.robots, batch) }));
      };
      const flushTimer = setInterval(flush, FLUSH_MS);

      const open = () => {
        socket = new WebSocket(`${fleetSocketUrl()}?token=${encodeURIComponent(token)}`);
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

      // Every (re)connect reloads inventory and snapshot, which resyncs missed
      // frames and surfaces an expired token as a 401 the socket cannot report.
      const start = () =>
        Promise.all([api.inventory(token), api.snapshot(token)])
          .then(([inventory, snapshot]) => {
            if (stopped) return;
            set({ sites: byId(inventory.sites), inventory: byId(inventory.robots), inventoryLoaded: true });
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

    async createRobot(input) {
      const robot = await guard(api.createRobot(authed(), input));
      set((s) => ({ inventory: { ...s.inventory, [robot.id]: robot } }));
      return robot;
    },

    async updateRobot(id, patch) {
      const robot = await guard(api.updateRobot(authed(), id, patch));
      set((s) => ({ inventory: { ...s.inventory, [robot.id]: robot } }));
      return robot;
    },

    async deleteRobot(id) {
      await guard(api.deleteRobot(authed(), id));
      set((s) => {
        const { [id]: _removed, ...inventory } = s.inventory;
        return { inventory };
      });
    },
  };
});
