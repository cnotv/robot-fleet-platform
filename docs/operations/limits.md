# Known limits

| Limit | Upgrade path |
| --- | --- |
| Ingestion has no device authentication | Per robot tokens or mTLS at the proxy |
| Login has no rate limiting | Rate limit `/api/auth/login` at the proxy or in the API |
| Orchestration API must run as one replica | Move MongoDB persistence into a single consumer, then scale the API |
| Activity report scans the history window on every request | Cache for 15 seconds, or maintain an hourly rollup collection |
| Schema changes use `prisma db push` | `prisma migrate deploy` once migrations exist |
| Deleted robots still stream if they keep connecting; the dashboard hides them | Reject unknown ids at ingestion by syncing the inventory |
| `RobotState` and the robot types are declared in both API and dashboard | A shared contracts package |
| Base map tiles come from the free OpenFreeMap service | A commercial or self hosted style for production |
