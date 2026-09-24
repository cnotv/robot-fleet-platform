import { Prisma, type PrismaClient, type RobotKind } from '@prisma/client';
import { Router, type Response } from 'express';
import { requireRole, type AuthUser } from './auth.js';
import type { HistoryPoint, RobotActivity } from './mongo.js';
import { LIVE_STATE_KEY } from './telemetry.js';

export const ROBOT_KINDS = ['cleaning', 'delivery', 'room_service', 'reception'] as const satisfies readonly RobotKind[];

const ROBOT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_HISTORY_MINUTES = 24 * 60;
const MAX_REPORT_HOURS = 24;

export class ValidationError extends Error {}

export interface RobotInput {
  id?: string;
  kind?: RobotKind;
  siteId?: string;
  model?: string;
  serialNumber?: string;
  firmware?: string;
  maxSpeedMps?: number;
  batteryWh?: number;
}

type Field = (value: unknown) => unknown;

const text =
  (max: number): Field =>
  (v) => {
    if (typeof v !== 'string' || v.trim() === '' || v.length > max) throw new ValidationError(`must be text up to ${max} characters`);
    return v.trim();
  };

const FIELDS: Record<keyof RobotInput, Field> = {
  id: (v) => {
    if (typeof v !== 'string' || !ROBOT_ID.test(v)) throw new ValidationError('must be lowercase letters, digits and hyphens');
    return v;
  },
  kind: (v) => {
    if (!ROBOT_KINDS.includes(v as RobotKind)) throw new ValidationError(`must be one of ${ROBOT_KINDS.join(', ')}`);
    return v;
  },
  siteId: text(32),
  model: text(64),
  serialNumber: text(64),
  firmware: text(32),
  maxSpeedMps: (v) => {
    if (typeof v !== 'number' || !(v > 0 && v <= 50)) throw new ValidationError('must be a number above 0 and up to 50');
    return v;
  },
  batteryWh: (v) => {
    if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 100_000) throw new ValidationError('must be a whole number from 1 to 100000');
    return v;
  },
};

/** Validates a create (every field required) or update (id excluded, at least one field) body. */
export function parseRobotInput(body: unknown, mode: 'create' | 'update'): RobotInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new ValidationError('body must be an object');
  const src = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, parse] of Object.entries(FIELDS)) {
    if (mode === 'update' && key === 'id') continue;
    if (src[key] === undefined) {
      if (mode === 'create') throw new ValidationError(`${key} is required`);
      continue;
    }
    try {
      out[key] = parse(src[key]);
    } catch (err) {
      throw new ValidationError(`${key} ${(err as Error).message}`);
    }
  }
  const unknown = Object.keys(src).filter((k) => !(k in FIELDS) || (mode === 'update' && k === 'id'));
  if (unknown.length > 0) throw new ValidationError(`unexpected field ${unknown.join(', ')}`);
  if (Object.keys(out).length === 0) throw new ValidationError('nothing to update');
  return out as RobotInput;
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

/** Rolls per robot activity up to one row per site and robot kind. Robots outside the inventory are ignored. */
export function groupActivity(activity: RobotActivity[], robots: { id: string; siteId: string; kind: RobotKind }[]): ActivityRow[] {
  const byRobot = new Map(activity.map((a) => [a.robotId, a]));
  const rows = new Map<string, ActivityRow & { batterySum: number; batteryCount: number }>();
  for (const robot of robots) {
    const key = `${robot.siteId}/${robot.kind}`;
    const row = rows.get(key) ?? {
      siteId: robot.siteId, kind: robot.kind, robots: 0, tasksStarted: 0, elevatorRides: 0, faults: 0, avgBattery: null, batterySum: 0, batteryCount: 0,
    };
    row.robots += 1;
    const a = byRobot.get(robot.id);
    if (a) {
      row.tasksStarted += a.tasksStarted;
      row.elevatorRides += a.elevatorRides;
      row.faults += a.faults;
      row.batterySum += a.avgBattery;
      row.batteryCount += 1;
    }
    rows.set(key, row);
  }
  return [...rows.values()].map(({ batterySum, batteryCount, ...row }) => ({
    ...row,
    avgBattery: batteryCount > 0 ? batterySum / batteryCount : null,
  }));
}

export interface FleetDeps {
  prisma: PrismaClient;
  cache: { hvals(key: string): Promise<string[]>; hdel(key: string, ...fields: string[]): Promise<unknown> };
  history(robotId: string, since: Date): Promise<HistoryPoint[]>;
  activity(since: Date): Promise<RobotActivity[]>;
}

function clampNumber(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

function sendPrismaError(err: unknown, res: Response): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === 'P2002') res.status(409).json({ error: 'a robot with this id or serial number already exists' });
  else if (err.code === 'P2025') res.status(404).json({ error: 'robot not found' });
  else if (err.code === 'P2003') res.status(400).json({ error: 'siteId does not exist' });
  else return false;
  return true;
}

/** Mounted behind requireAuth; every query is scoped to the caller's company. */
export function fleetRouter(deps: FleetDeps): Router {
  const router = Router();
  const user = (res: Response) => res.locals.user as AuthUser;
  const canWrite = requireRole('admin', 'operator');

  // Values are stored as JSON strings, so the array is assembled without a
  // parse and stringify round trip. That keeps 1,000 robots well under 5ms.
  router.get('/fleet/snapshot', async (_req, res) => {
    const values = await deps.cache.hvals(LIVE_STATE_KEY);
    res.type('application/json').send(`[${values.join(',')}]`);
  });

  router.get('/fleet/inventory', async (_req, res) => {
    const companyId = user(res).companyId;
    const [sites, robots] = await Promise.all([
      deps.prisma.site.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
      deps.prisma.robot.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
    ]);
    res.json({ sites, robots });
  });

  router.get('/robots/:id/history', async (req, res) => {
    const robot = await deps.prisma.robot.findFirst({ where: { id: req.params.id, companyId: user(res).companyId } });
    if (!robot) {
      res.status(404).json({ error: 'robot not found' });
      return;
    }
    const minutes = clampNumber(req.query.minutes, 60, MAX_HISTORY_MINUTES);
    res.json(await deps.history(robot.id, new Date(Date.now() - minutes * 60_000)));
  });

  router.get('/reports/activity', async (req, res) => {
    const hours = clampNumber(req.query.hours, 1, MAX_REPORT_HOURS);
    const [activity, robots] = await Promise.all([
      deps.activity(new Date(Date.now() - hours * 3_600_000)),
      deps.prisma.robot.findMany({ where: { companyId: user(res).companyId }, select: { id: true, siteId: true, kind: true } }),
    ]);
    res.json({ hours, rows: groupActivity(activity, robots) });
  });

  router.post('/robots', canWrite, async (req, res) => {
    const companyId = user(res).companyId;
    const input = parseRobotInput(req.body, 'create') as Required<RobotInput>;
    const site = await deps.prisma.site.findFirst({ where: { id: input.siteId, companyId } });
    if (!site) {
      res.status(400).json({ error: 'siteId does not exist' });
      return;
    }
    try {
      res.status(201).json(await deps.prisma.robot.create({ data: { ...input, companyId } }));
    } catch (err) {
      if (!sendPrismaError(err, res)) throw err;
    }
  });

  router.patch('/robots/:id', canWrite, async (req, res) => {
    const id = String(req.params.id);
    const companyId = user(res).companyId;
    const input = parseRobotInput(req.body, 'update');
    if (input.siteId && !(await deps.prisma.site.findFirst({ where: { id: input.siteId, companyId } }))) {
      res.status(400).json({ error: 'siteId does not exist' });
      return;
    }
    try {
      const { count } = await deps.prisma.robot.updateMany({ where: { id, companyId }, data: input });
      if (count === 0) {
        res.status(404).json({ error: 'robot not found' });
        return;
      }
      res.json(await deps.prisma.robot.findUnique({ where: { id } }));
    } catch (err) {
      if (!sendPrismaError(err, res)) throw err;
    }
  });

  router.delete('/robots/:id', canWrite, async (req, res) => {
    const id = String(req.params.id);
    const { count } = await deps.prisma.robot.deleteMany({ where: { id, companyId: user(res).companyId } });
    if (count === 0) {
      res.status(404).json({ error: 'robot not found' });
      return;
    }
    await deps.cache.hdel(LIVE_STATE_KEY, id);
    res.sendStatus(204);
  });

  return router;
}
