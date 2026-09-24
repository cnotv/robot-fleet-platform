# Agent instructions

Guidance for AI coding agents (and humans) working in this repository.

## Layout

* `ingestion-service/`: Go WebSocket ingestion and the fleet simulator (`cmd/simulator`).
* `orchestration-api/`: Node.js and TypeScript API, Prisma schema in `prisma/`.
* `fleet-dashboard/`: Next.js dashboard.
* `docs/`: VitePress documentation site, published to GitHub Pages.
* `ingestion-service/cmd/simulator/hotel-fleet.json`: demo hotels and robots, used by the simulator and seeded by the API.

## Before you finish a change

Run the checks for every part you touched:

```sh
cd ingestion-service && go vet ./... && go test -race ./...
cd orchestration-api && npm run typecheck && npm test
cd fleet-dashboard && npm run typecheck && npm run build
cd docs && npm run build
```

## Documentation is part of the change

Update `docs/` in the same change as the code. `docs/contributing.md` has the table that maps each kind of code change to the page it affects. Diagrams are Mermaid blocks in Markdown; edit them as text. A new page also needs a sidebar entry in `docs/.vitepress/config.mts`.

## Conventions

* Commit subjects are `<type>: <summary>` and never reference issue numbers.
* No em dash, en dash or hyphen as punctuation in prose, comments or UI text.
* Deliberate shortcuts are marked with a `ponytail:` comment naming the ceiling; list them in `docs/operations/limits.md`.
