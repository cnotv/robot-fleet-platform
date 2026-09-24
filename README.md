# Robot Fleet Platform

Real time resource management for a fleet of 1,000 robots. Three decoupled services share one repository and one local compose profile.

Architecture documentation: https://cnotv.github.io/robot-fleet-platform/ (published from `docs/` by `.github/workflows/pages.yml` on every push to `main`).

```
robot ──ws──▶ ingestion-service ──pub──▶ Redis channel robot:telemetry:live
                (Go)                              │
                                                  ▼
                                   orchestration-api (Node, TS)
                                   ├─ HSET fleet:live_state  (Redis)
                                   ├─ bulk insert telemetry  (MongoDB)
                                   ├─ users, robots          (PostgreSQL)
                                   └─ /ws/fleet batches ──ws──▶ fleet-dashboard (Next.js)
```

| Path | Stack | Port |
| --- | --- | --- |
| `ingestion-service/` | Go, `net/http`, `gorilla/websocket`, `go-redis` | 8080 |
| `orchestration-api/` | Node 20, TypeScript, Express 5, Prisma, Mongoose, ioredis, ws | 4000 |
| `fleet-dashboard/` | Next.js App Router, React, Tailwind, Zustand, lucide-react, TanStack Virtual | 3000 |

## Quick start

Everything in containers, with 1,000 simulated robots:

```bash
docker compose --profile apps --profile sim up --build
```

Open http://localhost:3000 and sign in with `` / `cnotv-admin`. The admin is created on first boot when the users table is empty. Override it with `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and set `JWT_SECRET` for anything beyond a laptop.

## Working on one service

Start only the databases, then run services from source:

```bash
docker compose up
```

```bash
cd ingestion-service && go run .
```

```bash
cd orchestration-api && npm install && npm run db:push && npm run dev
```

The API reads `DATABASE_URL`, `MONGO_URL`, `REDIS_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`. For local runs:

```bash
export DATABASE_URL=postgresql://cnotv:cnotv@localhost:5432/fleet MONGO_URL=mongodb://localhost:27017/fleet JWT_SECRET=dev ADMIN_EMAIL= ADMIN_PASSWORD=cnotv-admin
```

```bash
cd fleet-dashboard && npm install && npm run dev
```

```bash
cd ingestion-service && go run ./cmd/simulator -n 1000
```

## Tests

```bash
cd ingestion-service && go test -race ./...
```

```bash
cd orchestration-api && npm test && npm run typecheck
```

```bash
cd fleet-dashboard && npm run typecheck && npm run build
```

## Services

### ingestion-service

* `GET /ws/robot/{id}` upgrades to a WebSocket. The id must match `^[a-z0-9][a-z0-9-]{0,63}$`.
* Each connection is served by its own goroutine.
* A frame may hold one packet object or an array of up to 5 packets. Unknown fields, missing fields, out of range values, a `robot_id` that differs from the connection id and timestamps more than 30s in the future are rejected.
* One frame per 500ms per connection is accepted. Every frame gets an ack: `{"ok":true}` or `{"ok":false,"error":"throttled"}`.
* Sanitized packets are published to `robot:telemetry:live` with an added `ingested_at`.
* `cmd/simulator` drives N virtual robots doing a random walk around Munich.

### orchestration-api

* `POST /api/auth/login` returns a JWT (HS256, 8h). `GET /api/auth/me` returns the caller.
* `GET /api/fleet/snapshot` (bearer token) returns every robot from the `fleet:live_state` hash. The cached values are already JSON, so the response is joined, not reserialized.
* `GET /ws/fleet?token=` streams arrays of changed robots every 250ms.
* The Redis subscriber keeps the latest state per robot in memory and flushes every 250ms: one `HSET`, one broadcast, one unordered `insertMany` into MongoDB.
* PostgreSQL (Prisma) holds `Company`, `User` with a `Role`, and the static `Robot` inventory.
* MongoDB (Mongoose) holds `TelemetrySample` (7 day TTL), `ErrorLog` and the `Skill` store catalogue.

### fleet-dashboard

* The Zustand store loads the snapshot, opens the fleet socket and buffers frames. React state is committed at most every 300ms. A reconnect reloads the snapshot so missed frames are resynced.
* `RobotTable` is virtualized; only visible rows are in the DOM.
* `FleetMap` draws all robots on a canvas in a `requestAnimationFrame` loop, reading the store outside React, so updates cost no React renders. Replace `drawRobots` with a Mapbox or deck.gl layer when a basemap is needed.

## Hosting in the cloud

The same Docker images run everywhere. Pick one of the two paths below.

> **Before exposing anything:** the robot endpoint has no authentication by design. Anyone who can reach it can report telemetry for any robot id. Keep it on a private network, behind a VPN, an IP allow list or mTLS at the proxy.

### Option A: one virtual machine with Docker Compose

Simplest path, and enough for the 1,000 robot target. Works on any provider that sells a Linux VM (Hetzner, DigitalOcean, AWS EC2, Google Compute Engine, Azure VM).

1. Create a VM with at least 2 vCPU and 4 GB RAM running Ubuntu 24.04, and install Docker Engine with the compose plugin:

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

2. Point three DNS `A` records at the VM: `app.example.com`, `api.example.com`, `robots.example.com`.

3. Allow only ports 22, 80 and 443 in the provider firewall. Compose binds every service to `127.0.0.1`, so databases stay private.

4. Clone and configure:

   ```bash
   git clone https://github.com/cnotv/robot-fleet-platform.git && cd robot-fleet-platform
   ```

   ```bash
   cp .env.example .env
   ```

   Fill `.env`: a random `JWT_SECRET` (`openssl rand -hex 32`), `POSTGRES_PASSWORD`, `ADMIN_PASSWORD`, and set `PUBLIC_DASHBOARD_URL=https://app.example.com` and `PUBLIC_API_URL=https://api.example.com`.

5. Build and start:

   ```bash
   docker compose --profile apps up -d --build
   ```

6. Install [Caddy](https://caddyserver.com/docs/install) on the host for automatic TLS and WebSocket proxying, and put this in `/etc/caddy/Caddyfile`:

   ```
   app.example.com {
       reverse_proxy 127.0.0.1:3000
   }
   api.example.com {
       reverse_proxy 127.0.0.1:4000
   }
   robots.example.com {
       reverse_proxy 127.0.0.1:8080
   }
   ```

   ```bash
   sudo systemctl reload caddy
   ```

7. Robots connect to `wss://robots.example.com/ws/robot/{id}`. The dashboard is at `https://app.example.com`. To load test from your laptop:

   ```bash
   cd ingestion-service && go run ./cmd/simulator -n 1000 -url wss://robots.example.com
   ```

8. Back up PostgreSQL on a schedule:

   ```bash
   docker compose exec -T postgres pg_dump -U cnotv fleet | gzip > fleet-$(date +%F).sql.gz
   ```

To update, `git pull` and run step 5 again.

### Option B: managed databases and container platform

Use this when you want the provider to run the databases and restart containers for you.

| Piece | AWS | Google Cloud | Azure | Other |
| --- | --- | --- | --- | --- |
| Containers | ECS Fargate + ALB | Cloud Run | Container Apps | Fly.io, Railway, Render |
| Redis (Pub/Sub required) | ElastiCache | Memorystore | Azure Cache for Redis | Upstash |
| PostgreSQL | RDS | Cloud SQL | Azure Database for PostgreSQL | Neon, Supabase |
| MongoDB | DocumentDB or Atlas | MongoDB Atlas | Cosmos DB for MongoDB or Atlas | MongoDB Atlas |
| Image registry | ECR | Artifact Registry | ACR | GitHub Container Registry |

1. Create the three databases in the same region and a private network that the containers can reach.

2. Build and push the images. The dashboard needs the public API URL at build time:

   ```bash
   docker build --target runtime -t $REGISTRY/ingestion-service:1.0.0 ingestion-service
   ```

   ```bash
   docker build --target runtime -t $REGISTRY/orchestration-api:1.0.0 orchestration-api
   ```

   ```bash
   docker build --target runtime --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t $REGISTRY/fleet-dashboard:1.0.0 fleet-dashboard
   ```

   ```bash
   docker push --all-tags $REGISTRY/ingestion-service && docker push --all-tags $REGISTRY/orchestration-api && docker push --all-tags $REGISTRY/fleet-dashboard
   ```

3. Deploy three services with these settings:

   | Service | Port | Environment | Replicas |
   | --- | --- | --- | --- |
   | ingestion-service | 8080 | `REDIS_URL` | 1 or more |
   | orchestration-api | 4000 | `REDIS_URL`, `DATABASE_URL`, `MONGO_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | exactly 1 |
   | fleet-dashboard | 3000 | none at runtime | 1 or more |

   Keep secrets in the platform secret store (Secrets Manager, Secret Manager, Key Vault), not in plain environment files.

4. Map the domains through the platform load balancer with TLS, and use `/healthz` as the health check for ingestion and API.

Platform notes:

* **One API replica.** Every API instance subscribes to the telemetry channel, so two replicas would write every sample to MongoDB twice. Scale ingestion and dashboard freely.
* **Background work.** The API processes Redis messages between requests. On Cloud Run set CPU to always allocated and minimum instances to 1; on Fargate and Container Apps this is the default.
* **WebSocket timeouts.** Raise the idle or request timeout to the maximum (ALB idle timeout 3600s, Cloud Run request timeout 3600s). Robots and the dashboard reconnect automatically when a connection is recycled.
* **Redis Pub/Sub.** Serverless Redis tiers must support `SUBSCRIBE`; check this before choosing one.
* **Schema.** The API runs `prisma db push` on boot, so the database user needs permission to create tables.

## Known limits

* The fleet socket carries the JWT in the query string because browsers cannot set WebSocket headers. Keep it out of access logs, or move to a short lived ticket issued by the API.
* The dashboard keeps the token in `sessionStorage`.
* Login has no rate limiting.
* The API container runs `prisma db push` on boot. Switch to `prisma migrate deploy` once migrations exist.
* `RobotState` is declared in both the API and the dashboard. Extract a shared package if the contract starts to move.
