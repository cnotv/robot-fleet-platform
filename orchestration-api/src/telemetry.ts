export const TELEMETRY_CHANNEL = 'robot:telemetry:live';
export const LIVE_STATE_KEY = 'fleet:live_state';

export const ROBOT_STATUSES = ['active', 'charging', 'error', 'idle'] as const;
export type RobotStatus = (typeof ROBOT_STATUSES)[number];

/** Domain model for the latest known state of one robot. */
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

export class TelemetryMappingError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(obj: Record<string, unknown>, key: string, min: number, max: number): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new TelemetryMappingError(`${key} must be a number in [${min}, ${max}]`);
  }
  return v;
}

function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string') throw new TelemetryMappingError(`${key} must be a string`);
  return v;
}

function isoDate(obj: Record<string, unknown>, key: string): string {
  const ms = Date.parse(str(obj, key));
  if (Number.isNaN(ms)) throw new TelemetryMappingError(`${key} must be an ISO 8601 date`);
  return new Date(ms).toISOString();
}

/**
 * Maps the snake_case packet published by the ingestion service to the
 * camelCase domain model. The ingestion service already sanitizes input;
 * this is the second check at the process boundary.
 */
export function toRobotState(raw: unknown): RobotState {
  if (!isRecord(raw) || !isRecord(raw.telemetry)) {
    throw new TelemetryMappingError('packet must be an object with a telemetry object');
  }
  const status = str(raw, 'status');
  if (!ROBOT_STATUSES.includes(status as RobotStatus)) {
    throw new TelemetryMappingError(`unknown status ${status}`);
  }
  const t = raw.telemetry;
  return {
    robotId: str(raw, 'robot_id'),
    status: status as RobotStatus,
    latitude: num(t, 'latitude', -90, 90),
    longitude: num(t, 'longitude', -180, 180),
    speedMps: num(t, 'speed_mps', 0, 50),
    batteryPct: num(t, 'battery_pct', 0, 100),
    currentTask: str(raw, 'current_task'),
    timestamp: isoDate(raw, 'timestamp'),
    ingestedAt: isoDate(raw, 'ingested_at'),
  };
}
