export const ROBOT_STATUSES = ['active', 'charging', 'error', 'idle'] as const;
export type RobotStatus = (typeof ROBOT_STATUSES)[number];

/** Mirrors RobotState in orchestration-api/src/telemetry.ts. */
export interface RobotState {
  robotId: string;
  status: RobotStatus;
  latitude: number;
  longitude: number;
  speedMps: number;
  batteryPct: number;
  currentTask: string;
  timestamp: string;
  ingestedAt: string;
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const FLEET_SOCKET_URL = `${API_URL.replace(/^http/, 'ws')}/ws/fleet`;

const TOKEN_KEY = 'cnotv.token';

export class UnauthorizedError extends Error {}

export const session = {
  get: (): string | null => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) throw new UnauthorizedError('Invalid email or password');
  if (!res.ok) throw new Error(`Login failed (${res.status})`);
  const { token } = (await res.json()) as { token: string };
  return token;
}

export async function fetchSnapshot(token: string): Promise<RobotState[]> {
  const res = await fetch(`${API_URL}/api/fleet/snapshot`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new UnauthorizedError('Session expired');
  if (!res.ok) throw new Error(`Snapshot failed (${res.status})`);
  return (await res.json()) as RobotState[];
}
