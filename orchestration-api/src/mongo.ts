import mongoose, { Schema } from 'mongoose';
import type { SampleEvent } from './live.js';
import { ROBOT_STATUSES, type RobotStatus } from './telemetry.js';

const TELEMETRY_RETENTION_SECONDS = 7 * 24 * 60 * 60;

/** Telemetry buffer. Documents expire automatically after the retention window. */
export const TelemetrySample = mongoose.model(
  'TelemetrySample',
  new Schema(
    {
      robotId: { type: String, required: true },
      event: { type: String, enum: ['task_started', 'status_changed', 'heartbeat'], required: true },
      status: { type: String, enum: ROBOT_STATUSES, required: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      speedMps: { type: Number, required: true },
      batteryPct: { type: Number, required: true },
      currentTask: { type: String, required: true },
      timestamp: { type: Date, required: true },
      ingestedAt: { type: Date, required: true, expires: TELEMETRY_RETENTION_SECONDS },
    },
    { versionKey: false },
  ).index({ robotId: 1, timestamp: -1 }),
);

export const ErrorLog = mongoose.model(
  'ErrorLog',
  new Schema(
    {
      source: { type: String, required: true },
      message: { type: String, required: true },
      stack: String,
      context: Schema.Types.Mixed,
    },
    { versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
  ),
);

/** Skill Store: installable robot capabilities. */
export const Skill = mongoose.model(
  'Skill',
  new Schema(
    {
      slug: { type: String, required: true, unique: true, match: /^[a-z0-9-]+$/ },
      name: { type: String, required: true },
      version: { type: String, required: true },
      description: { type: String, default: '' },
      compatibleModels: { type: [String], default: [] },
      entrypoint: { type: String, required: true },
      configSchema: { type: Schema.Types.Mixed, default: {} },
      published: { type: Boolean, default: false },
    },
    { versionKey: false, timestamps: true },
  ),
);

export interface HistoryPoint {
  timestamp: Date;
  event: SampleEvent;
  status: RobotStatus;
  batteryPct: number;
  speedMps: number;
  currentTask: string;
}

/** Most recent samples for one robot, oldest first. */
export async function robotHistory(robotId: string, since: Date, limit = 720): Promise<HistoryPoint[]> {
  const docs = await TelemetrySample.find(
    { robotId, timestamp: { $gte: since } },
    { _id: 0, timestamp: 1, event: 1, status: 1, batteryPct: 1, speedMps: 1, currentTask: 1 },
  )
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean<HistoryPoint[]>();
  return docs.reverse();
}

export interface RobotActivity {
  robotId: string;
  tasksStarted: number;
  elevatorRides: number;
  faults: number;
  avgBattery: number;
}

const isTaskStart = { $eq: ['$event', 'task_started'] };

/** Per robot counters over the telemetry buffer since the given time. */
export async function activityByRobot(since: Date): Promise<RobotActivity[]> {
  // ponytail: scans the window on every call; add a 15s cache or a rollup collection if reports get heavy traffic.
  return TelemetrySample.aggregate<RobotActivity>([
    { $match: { ingestedAt: { $gte: since } } },
    {
      $group: {
        _id: '$robotId',
        tasksStarted: { $sum: { $cond: [isTaskStart, 1, 0] } },
        elevatorRides: {
          $sum: {
            $cond: [{ $and: [isTaskStart, { $regexMatch: { input: '$currentTask', regex: '^ride_elevator' } }] }, 1, 0],
          },
        },
        faults: {
          $sum: { $cond: [{ $and: [{ $eq: ['$status', 'error'] }, { $ne: ['$event', 'heartbeat'] }] }, 1, 0] },
        },
        avgBattery: { $avg: '$batteryPct' },
      },
    },
    { $project: { _id: 0, robotId: '$_id', tasksStarted: 1, elevatorRides: 1, faults: 1, avgBattery: 1 } },
  ]);
}

export function logError(err: unknown, context: Record<string, unknown>): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const source = typeof context.source === 'string' ? context.source : 'orchestration-api';
  console.error(`[${source}]`, error.message);
  ErrorLog.create({ source, message: error.message, stack: error.stack, context }).catch((writeErr: unknown) =>
    console.error('[error-log] write failed', writeErr),
  );
}
