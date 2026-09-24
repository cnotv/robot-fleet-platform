# Configuration

| Variable | Service | Meaning |
| --- | --- | --- |
| `REDIS_URL` | ingestion, api | Redis connection URL |
| `ADDR` | ingestion | Listen address, default `:8080` |
| `DATABASE_URL` | api | PostgreSQL connection URL |
| `MONGO_URL` | api | MongoDB connection URL |
| `JWT_SECRET` | api | JWT signing secret, required |
| `CORS_ORIGIN` | api | Public dashboard origin |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | api | First admin, created when no users exist |
| `DEMO_FLEET_FILE` | api | Fleet JSON seeded when no robots exist; the image ships one at `/app/demo/hotel-fleet.json`. Unset to start empty |
| `TELEMETRY_RETENTION_DAYS` | api | Days of telemetry history kept in MongoDB, default 7 (2 in the VM setup) |
| `PORT` | api | Listen port, default 4000 |
| `PUBLIC_API_URL` | dashboard, runtime | API base URL for the browser; empty means same origin, as behind the Kubernetes ingress |

For a VM, `deploy/vm/.env.example` lists every setting, including the target `DOCKER_HOST`; see [Any VM with Traefik](/operations/vm).

In Kubernetes these come from the `fleet-config` ConfigMap and the `fleet-secrets` Secret; see [Kubernetes](/operations/kubernetes).

Docker Compose reads the values below from `.env` (see `.env.example`): `JWT_SECRET`, `POSTGRES_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLIC_DASHBOARD_URL`, `PUBLIC_API_URL`, `BIND_ADDR`.
