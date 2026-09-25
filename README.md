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
make up
```

`make up` runs `docker compose --profile apps --profile sim up --build -d`; `make test` runs every test suite. The same images also run on Kubernetes: `make k8s-local` deploys them to a local cluster (see [Kubernetes](https://cnotv.github.io/robot-fleet-platform/operations/kubernetes)).

Before the first start, copy `.env.example` to `.env` and set `ADMIN_EMAIL` and `ADMIN_PASSWORD`. On first boot with an empty database the API creates that admin and seeds the hotels and robots from `ingestion-service/cmd/simulator/hotel-fleet.json`. Open http://localhost:3000 and sign in with them. Set `JWT_SECRET` for anything beyond a laptop.

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
export DATABASE_URL=postgresql://cnotv:cnotv@localhost:5432/fleet MONGO_URL=mongodb://localhost:27017/fleet JWT_SECRET=dev DEMO_FLEET_FILE=../ingestion-service/cmd/simulator/hotel-fleet.json
```

Add `ADMIN_EMAIL` and `ADMIN_PASSWORD` with your own values to create the first admin.

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

The same Docker images run everywhere. Pick one of the three paths below.

> **Before exposing anything:** the robot endpoint has no authentication by design. Anyone who can reach it can report telemetry for any robot id. Keep it on a private network, behind a VPN, an IP allow list or mTLS at the proxy.

### Option A: any VM over SSH, behind Traefik

Simplest path, and enough for the 1,000 robot target: one VM with 2 vCPU and 4 GB on any cloud. Docker deploys to it over SSH from your machine; Traefik routes by container labels and issues certificates.

```bash
cp deploy/vm/.env.example deploy/vm/.env   # set DOCKER_HOST=ssh://root@<ip>, hostnames, secrets
```

```bash
make vm-bootstrap   # once: Docker and swap on the VM
```

```bash
make vm-proxy       # the shared Traefik proxy
```

```bash
make vm-deploy      # the platform, from the images CI publishes
```

Point DNS for your fleet, robots and Traefik hostnames at the VM first. The full guide, including moving existing containers off Nginx Proxy Manager, is [Any VM with Traefik](https://cnotv.github.io/robot-fleet-platform/operations/vm).

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

2. Build and push the images, or use the ones CI publishes to `ghcr.io/cnotv/robot-fleet-platform/<service>`:

   ```bash
   docker build --target runtime -t $REGISTRY/ingestion-service:1.0.0 ingestion-service
   ```

   ```bash
   docker build --target runtime --build-context fleet=ingestion-service/cmd/simulator -t $REGISTRY/orchestration-api:1.0.0 orchestration-api
   ```

   ```bash
   docker build --target runtime -t $REGISTRY/fleet-dashboard:1.0.0 fleet-dashboard
   ```

   ```bash
   docker push --all-tags $REGISTRY/ingestion-service && docker push --all-tags $REGISTRY/orchestration-api && docker push --all-tags $REGISTRY/fleet-dashboard
   ```

3. Deploy three services with these settings:

   | Service | Port | Environment | Replicas |
   | --- | --- | --- | --- |
   | ingestion-service | 8080 | `REDIS_URL` | 1 or more |
   | orchestration-api | 4000 | `REDIS_URL`, `DATABASE_URL`, `MONGO_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | exactly 1 |
   | fleet-dashboard | 3000 | `PUBLIC_API_URL` | 1 or more |

   Keep secrets in the platform secret store (Secrets Manager, Secret Manager, Key Vault), not in plain environment files.

4. Map the domains through the platform load balancer with TLS, and use `/healthz` as the health check for ingestion and API.

Platform notes:

* **One API replica.** Every API instance subscribes to the telemetry channel, so two replicas would write every sample to MongoDB twice. Scale ingestion and dashboard freely.
* **Background work.** The API processes Redis messages between requests. On Cloud Run set CPU to always allocated and minimum instances to 1; on Fargate and Container Apps this is the default.
* **WebSocket timeouts.** Raise the idle or request timeout to the maximum (ALB idle timeout 3600s, Cloud Run request timeout 3600s). Robots and the dashboard reconnect automatically when a connection is recycled.
* **Redis Pub/Sub.** Serverless Redis tiers must support `SUBSCRIBE`; check this before choosing one.
* **Schema.** The API runs `prisma db push` on boot, so the database user needs permission to create tables.

### Option C: Kubernetes

Kustomize manifests in `deploy/k8s/` run the same images on any cluster. The `production` overlay expects managed databases, pulls the images CI pushes to GHCR, and adds TLS, a robot IP allow list and autoscaling.

```bash
kubectl apply -k deploy/k8s/overlays/production
```

Create the `fleet-secrets` secret and set your hosts first; the full procedure is in [Kubernetes](https://cnotv.github.io/robot-fleet-platform/operations/kubernetes#production).

## Known limits

See [Known limits](https://cnotv.github.io/robot-fleet-platform/operations/limits) for the list and the upgrade path for each.
