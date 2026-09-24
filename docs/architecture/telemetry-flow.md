# Telemetry flow

A packet travels from robot to pixel in about half a second in the worst case: up to 250ms waiting for the API batch plus up to 300ms waiting for the dashboard flush.

```mermaid
sequenceDiagram
  autonumber
  participant Robot
  participant Ingest as ingestion-service
  participant Redis
  participant API as orchestration-api
  participant Mongo as MongoDB
  participant UI as fleet-dashboard
  Robot->>Ingest: WebSocket frame (JSON packet)
  Ingest->>Ingest: throttle, strict decode, sanitize
  Ingest->>Redis: PUBLISH robot:telemetry:live
  Ingest-->>Robot: {"ok": true}
  Redis-->>API: message
  API->>API: map to RobotState, apply persistence policy
  Note over API: every 250ms
  API->>Redis: HSET fleet:live_state
  API-)Mongo: insertMany (changes and heartbeats)
  API-)UI: WebSocket frame: RobotState[]
  Note over UI: buffer, commit every 300ms
  UI->>UI: update map, stats, table, reports
```

## Dashboard start up

```mermaid
sequenceDiagram
  participant UI as fleet-dashboard
  participant API as orchestration-api
  UI->>API: POST /api/auth/login
  API-->>UI: JWT (kept in sessionStorage)
  par
    UI->>API: GET /api/fleet/inventory
  and
    UI->>API: GET /api/fleet/snapshot
  end
  UI->>API: WebSocket /ws/fleet?token=
  loop every 250ms
    API-)UI: changed robots
  end
  Note over UI,API: on disconnect: wait 2s, reload inventory and snapshot, reconnect
```
