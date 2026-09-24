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
| `DEMO_FLEET_FILE` | api | Fleet JSON seeded when no robots exist; unset to start empty |
| `PORT` | api | Listen port, default 4000 |
| `NEXT_PUBLIC_API_URL` | dashboard, build time | Public API URL baked into the client bundle |

Docker Compose reads the values below from `.env` (see `.env.example`): `JWT_SECRET`, `POSTGRES_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLIC_DASHBOARD_URL`, `PUBLIC_API_URL`, `BIND_ADDR`.
