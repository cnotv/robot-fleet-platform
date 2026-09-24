# Data model

## PostgreSQL

Schema: `orchestration-api/prisma/schema.prisma`.

```mermaid
erDiagram
  Company ||--o{ User : employs
  Company ||--o{ Site : operates
  Company ||--o{ Robot : owns
  Site ||--o{ Robot : hosts
  Company {
    string id PK
    string name UK
  }
  User {
    string id PK
    string email UK
    string passwordHash
    Role role "admin, operator, viewer"
    string companyId FK
  }
  Site {
    string id PK "for example muc"
    string name
    string city
    string country
    string region
    float latitude
    float longitude
    string timezone "IANA"
    string companyId FK
  }
  Robot {
    string id PK "same id as telemetry"
    RobotKind kind "cleaning, delivery, room_service, reception"
    string serialNumber UK
    string model
    string firmware
    float maxSpeedMps
    int batteryWh
    string siteId FK
    string companyId FK
    datetime commissionedAt
  }
```

## MongoDB

| Collection | Contents | Indexes | Retention |
| --- | --- | --- | --- |
| `telemetrysamples` | Persisted samples with `event`: `task_started`, `status_changed` or `heartbeat` | `robotId + timestamp`, `ingestedAt` | 7 days (TTL) |
| `errorlogs` | Mapping failures, HTTP errors, failed writes | none | Unbounded |
| `skills` | Skill Store catalogue: slug, version, compatible models, entrypoint, config schema | `slug` unique | Unbounded |

## Redis

Redis holds nothing that cannot be rebuilt: `fleet:live_state` refills within one second of robots reporting.
