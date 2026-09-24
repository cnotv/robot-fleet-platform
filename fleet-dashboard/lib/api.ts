export const ROBOT_STATUSES = ['active', 'charging', 'error', 'idle'] as const;
export type RobotStatus = (typeof ROBOT_STATUSES)[number];

export const ROBOT_KINDS = ['cleaning', 'delivery', 'room_service', 'reception'] as const;
export type RobotKind = (typeof ROBOT_KINDS)[number];

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

export interface Site {
  id: string;
  name: string;
  city: string;
  country: string;
  region: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

/** Static inventory record from PostgreSQL. */
export interface RobotInfo {
  id: string;
  kind: RobotKind;
  siteId: string;
  model: string;
  serialNumber: string;
  firmware: string;
  maxSpeedMps: number;
  batteryWh: number;
  commissionedAt: string;
}

export type RobotInput = Omit<RobotInfo, 'commissionedAt'>;

export interface HistoryPoint {
  timestamp: string;
  event: 'task_started' | 'status_changed' | 'heartbeat';
  status: RobotStatus;
  batteryPct: number;
  speedMps: number;
  currentTask: string;
}

export interface ActivityRow {
  siteId: string;
  kind: RobotKind;
  robots: number;
  tasksStarted: number;
  elevatorRides: number;
  faults: number;
  avgBattery: number | null;
}

/**
 * API base URL from the PUBLIC_API_URL runtime variable (see app/layout.tsx).
 * Empty means same origin, as behind the Kubernetes ingress.
 */
function apiUrl(): string {
  return typeof document === 'undefined' ? '' : (document.body.dataset.apiUrl ?? '');
}

export function fleetSocketUrl(): string {
  return `${(apiUrl() || window.location.origin).replace(/^http/, 'ws')}/ws/fleet`;
}

const TOKEN_KEY = 'fleet.token';

export class UnauthorizedError extends Error {}
export class ApiError extends Error {}

export const session = {
  get: (): string | null => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export type Role = 'admin' | 'operator' | 'viewer';

/** Reads the role claim for showing or hiding controls. The API enforces it. */
export function tokenRole(token: string): Role {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: Role };
    return payload.role ?? 'viewer';
  } catch {
    return 'viewer';
  }
}

async function request<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401) throw new UnauthorizedError('Session expired');
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function login(email: string, password: string): Promise<string> {
  try {
    const { token } = await request<{ token: string }>('/api/auth/login', null, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return token;
  } catch (err) {
    throw err instanceof UnauthorizedError ? new UnauthorizedError('Invalid email or password') : err;
  }
}

export const api = {
  snapshot: (token: string) => request<RobotState[]>('/api/fleet/snapshot', token),
  inventory: (token: string) => request<{ sites: Site[]; robots: RobotInfo[] }>('/api/fleet/inventory', token),
  history: (token: string, robotId: string, minutes = 60) =>
    request<HistoryPoint[]>(`/api/robots/${encodeURIComponent(robotId)}/history?minutes=${minutes}`, token),
  activity: (token: string, hours: number) => request<{ hours: number; rows: ActivityRow[] }>(`/api/reports/activity?hours=${hours}`, token),
  createRobot: (token: string, robot: RobotInput) =>
    request<RobotInfo>('/api/robots', token, { method: 'POST', body: JSON.stringify(robot) }),
  updateRobot: (token: string, id: string, patch: Partial<Omit<RobotInput, 'id'>>) =>
    request<RobotInfo>(`/api/robots/${encodeURIComponent(id)}`, token, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteRobot: (token: string, id: string) =>
    request<void>(`/api/robots/${encodeURIComponent(id)}`, token, { method: 'DELETE' }),
};
