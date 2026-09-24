import mongoose, { Schema } from 'mongoose';
import { ROBOT_STATUSES } from './telemetry.js';

const TELEMETRY_RETENTION_SECONDS = 7 * 24 * 60 * 60;

/** Raw telemetry buffer. Documents expire automatically after the retention window. */
export const TelemetrySample = mongoose.model(
  'TelemetrySample',
  new Schema(
    {
      robotId: { type: String, required: true },
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

export function logError(err: unknown, context: Record<string, unknown>): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const source = typeof context.source === 'string' ? context.source : 'orchestration-api';
  console.error(`[${source}]`, error.message);
  ErrorLog.create({ source, message: error.message, stack: error.stack, context }).catch((writeErr: unknown) =>
    console.error('[error-log] write failed', writeErr),
  );
}
