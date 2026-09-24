# HTTP and WebSocket API

All `/api` routes except login need `Authorization: Bearer <jwt>`. Data is always scoped to the caller's company.

## Endpoints

| Service | Method and path | Role | Purpose |
| --- | --- | --- | --- |
| ingestion | `GET /ws/robot/{id}` | none | Robot telemetry socket |
| ingestion | `GET /healthz` | none | Liveness, 204 |
| api | `POST /api/auth/login` | none | Email and password to JWT (HS256, 8h) |
| api | `GET /api/auth/me` | any | Current user |
| api | `GET /api/fleet/snapshot` | any | Latest state of every robot |
| api | `GET /api/fleet/inventory` | any | `{ sites, robots }` from PostgreSQL |
| api | `GET /api/robots/{id}/history?minutes=60` | any | Persisted samples, oldest first, up to 720 points, window up to 24h |
| api | `GET /api/reports/activity?hours=1` | any | Tasks started, elevator rides, faults and average battery per hotel and robot type, window up to 24h |
| api | `POST /api/robots` | admin, operator | Create a robot, 201 |
| api | `PATCH /api/robots/{id}` | admin, operator | Update any field except the id |
| api | `DELETE /api/robots/{id}` | admin, operator | Delete the record and its live state, 204 |
| api | `GET /ws/fleet?token=` | any | Arrays of changed robots every 250ms |
| api | `GET /healthz` | none | Liveness, 204 |

## Errors

| Status | When |
| --- | --- |
| 400 | Validation failed, unknown field, invalid JSON, unknown hotel. The body is `{ "error": "<reason>" }` |
| 401 | Missing, invalid or expired token |
| 403 | Role not allowed to write |
| 404 | Robot not found in the caller's company |
| 409 | Robot id or serial number already exists |

## Robot packet (robot to ingestion)

```json
{
  "robot_id": "muc-dlv-07",
  "status": "active",
  "telemetry": { "latitude": 48.1402, "longitude": 11.5586, "speed_mps": 1.2, "battery_pct": 84.5 },
  "current_task": "deliver_room_1204",
  "timestamp": "2026-09-24T00:00:00Z"
}
```

| Field | Rule |
| --- | --- |
| `status` | `active`, `charging`, `error` or `idle` |
| `latitude`, `longitude` | [-90, 90] and [-180, 180] |
| `speed_mps` | [0, 50] |
| `battery_pct` | [0, 100] |
| `current_task` | `[A-Za-z0-9_.:-]`, up to 128 characters |
| `timestamp` | RFC 3339, at most 30s in the future |

## Live state (API to dashboard)

```json
{
  "robotId": "muc-dlv-07",
  "status": "active",
  "latitude": 48.1402,
  "longitude": 11.5586,
  "speedMps": 1.2,
  "batteryPct": 84.5,
  "currentTask": "deliver_room_1204",
  "timestamp": "2026-09-24T00:00:00.000Z",
  "ingestedAt": "2026-09-24T00:00:00.120Z"
}
```

## Robot record (create body)

```json
{
  "id": "muc-dlv-99",
  "kind": "delivery",
  "siteId": "muc",
  "model": "Courier D2",
  "serialNumber": "SN-200001",
  "firmware": "5.0.0",
  "maxSpeedMps": 1.2,
  "batteryWh": 900
}
```

`kind` is `cleaning`, `delivery`, `room_service` or `reception`. `maxSpeedMps` is above 0 and up to 50; `batteryWh` is a whole number from 1 to 100000.

## Redis keys

| Key | Type | Writer | Reader |
| --- | --- | --- | --- |
| `robot:telemetry:live` | Pub/Sub channel | ingestion-service | orchestration-api |
| `fleet:live_state` | Hash: robot id to RobotState JSON | orchestration-api | snapshot endpoint |
