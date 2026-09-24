# Robot Fleet Platform

Real time resource management for a fleet of 1,000 robots. Three decoupled services share one repository and one local compose profile.

The demo models a global hotel group: cleaning, delivery, room service and reception robots in 20 hotels on five continents, with a world map, location filters, reports and robot management in the dashboard.

**Documentation: https://cnotv.github.io/robot-fleet-platform/** Markdown sources live in [`docs/`](docs/) and are built with VitePress and published by `.github/workflows/pages.yml` on every push to `main`. See [docs/contributing.md](docs/contributing.md) to edit them, and [AGENTS.md](AGENTS.md) for agent instructions.

```
robot ──ws──▶ ingestion-service ──pub──▶ Redis channel robot:telemetry:live
                (Go)                              │
                                                  ▼
                                   orchestration-api (Node, TS)
                                   ├─ HSET fleet:live_state  (Redis)
                                   ├─ changes + heartbeats   (MongoDB)
                                   ├─ users, hotels, robots  (PostgreSQL)
                                   └─ /ws/fleet batches ──ws──▶ fleet-dashboard (Next.js)
```

| Path | Stack | Port |
| --- | --- | --- |
| `ingestion-service/` | Go, `net/http`, `gorilla/websocket`, `go-redis` | 8080 |
| `orchestration-api/` | Node 20, TypeScript, Express 5, Prisma, Mongoose, ioredis, ws | 4000 |
| `fleet-dashboard/` | Next.js App Router, React, Tailwind, Zustand, MapLibre GL, TanStack Virtual, lucide-react | 3000 |
| `docs/` | VitePress, Mermaid | |

## Quick start

Everything in containers, with 20 hotels and 1,000 simulated robots:

```bash
docker compose --profile apps --profile sim up --build
```

Open http://localhost:3000 and sign in with `` / `cnotv-admin`. On first boot with an empty database the API creates this admin and seeds the hotels and robots from `ingestion-service/cmd/simulator/hotel-fleet.json`. Override it with `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and set `JWT_SECRET` for anything beyond a laptop.

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

The API reads `DATABASE_URL`, `MONGO_URL`, `REDIS_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `DEMO_FLEET_FILE`. For local runs:

```bash
export DATABASE_URL=postgresql://cnotv:cnotv@localhost:5432/fleet MONGO_URL=mongodb://localhost:27017/fleet JWT_SECRET=dev ADMIN_EMAIL= ADMIN_PASSWORD=cnotv-admin DEMO_FLEET_FILE=../ingestion-service/cmd/simulator/hotel-fleet.json
```

```bash
cd fleet-dashboard && npm install && npm run dev
```

```bash
cd ingestion-service && go run ./cmd/simulator
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

```bash
cd docs && npm install && npm run build
```

## Services

| Service | Summary | Details |
| --- | --- | --- |
| ingestion-service | One goroutine per robot socket, strict validation, 500ms throttle, publishes to Redis. Includes the hotel fleet simulator. | [docs](https://cnotv.github.io/robot-fleet-platform/architecture/ingestion) |
| orchestration-api | JWT auth with roles, inventory and robot CRUD, live cache, telemetry history, activity reports, dashboard socket. | [docs](https://cnotv.github.io/robot-fleet-platform/architecture/orchestration-api), [API reference](https://cnotv.github.io/robot-fleet-platform/reference/api) |
| fleet-dashboard | World map with clustering, location filters, hotel and robot pages, four reports, create, edit and delete robots. | [docs](https://cnotv.github.io/robot-fleet-platform/guide/dashboard) |

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
   cd ingestion-service && go run ./cmd/simulator -url wss://robots.example.com
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

See [Known limits](https://cnotv.github.io/robot-fleet-platform/operations/limits) for the list and the upgrade path for each.
