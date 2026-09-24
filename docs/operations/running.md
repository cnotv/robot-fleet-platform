# Running and testing

## Everything in containers

```sh
make up      # same as: docker compose --profile apps --profile sim up --build -d
make test    # unit tests and type checks for every service
```

The same images also run on a local Kubernetes cluster with `make k8s-local`; see [Kubernetes](/operations/kubernetes).

Seeds 20 hotels and 1,000 robots on first start and runs the simulator against them. The dashboard is at http://localhost:3000.

## One service from source

```sh
docker compose up                     # databases only
cd ingestion-service && go run .
cd orchestration-api && npm install && npm run db:push && npm run dev
cd fleet-dashboard && npm install && npm run dev
cd ingestion-service && go run ./cmd/simulator
```

For the API, export `DATABASE_URL`, `MONGO_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `DEMO_FLEET_FILE=../ingestion-service/cmd/simulator/hotel-fleet.json`.

## Tests

| Command | Covers |
| --- | --- |
| `cd ingestion-service && go test -race ./...` | Handshake, throttling, sanitization, packet mapping |
| `cd orchestration-api && npm test && npm run typecheck` | Mapping, persistence policy, validation, roles, activity roll up, socket handshake |
| `cd fleet-dashboard && npm run typecheck && npm run build` | Types and build of every page |
| `cd docs && npm run build` | Every docs page and diagram |

## Health and logs

`GET /healthz` returns 204 on ingestion and API. Ingestion logs JSON lines to stdout; the API logs to stdout and to the `errorlogs` collection.
