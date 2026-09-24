# Orchestration API

Node.js 20, TypeScript in strict mode, Express 5, Prisma (PostgreSQL), Mongoose (MongoDB), ioredis, ws. Source: `orchestration-api/src/`.

| File | Responsibility |
| --- | --- |
| `index.ts` | Wiring: connections, seed, pipeline, timers, shutdown |
| `app.ts` | Express app, CORS, error mapping |
| `auth.ts` | Login, JWT, `requireAuth`, `requireRole` |
| `fleet.ts` | Snapshot, inventory, history, reports, robot CRUD and its validation |
| `live.ts` | Redis subscriber pipeline and the persistence policy |
| `telemetry.ts` | Wire packet to `RobotState` mapping |
| `mongo.ts` | Mongo models, history query, activity aggregation, error log |
| `ws.ts` | Dashboard WebSocket with JWT handshake |
| `seed.ts` | First admin and demo fleet on an empty database |

## Live pipeline

Every packet from Redis is mapped to a `RobotState`. Every 250ms the pipeline flushes:

1. one `HSET fleet:live_state` with the latest state of each robot that changed,
2. one WebSocket frame to every dashboard client,
3. one unordered `insertMany` into MongoDB with the samples that passed the persistence policy.

## Persistence policy

Storing every packet would mean 86 million documents a day. A sample is persisted only when:

| Event | Condition |
| --- | --- |
| `task_started` | The task differs from the last persisted sample, or it is the first sample since start up |
| `status_changed` | Same task, different status |
| `heartbeat` | Nothing changed for 10 seconds |

With the demo fleet that is roughly 70 documents a second instead of 1,000, and the event field is what reports count.

## Reports

`GET /api/reports/activity` aggregates the history per robot (tasks started, elevator rides, faults, average battery) and rolls it up per hotel and robot type against the caller's inventory.

## Tests

`telemetry.test.ts` covers the mapping and the persistence policy. `fleet.test.ts` covers robot input validation and the activity roll up. `app.test.ts` covers bearer auth, roles, validation errors and the dashboard socket handshake.
