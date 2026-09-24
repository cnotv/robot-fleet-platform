# Security model

* **Robots** are unauthenticated by design. Strict validation limits damage, but any client that can reach the ingestion endpoint can report for any robot id. Restrict it at the network edge (private network, VPN, IP allow list or mTLS) before exposing it.
* **Users** sign in with bcrypt hashed passwords and receive an HS256 JWT valid for 8 hours. `JWT_SECRET` must be a long random value in every shared environment.
* **Roles**: `admin` and `operator` can create, update and delete robots; `viewer` is read only. The dashboard hides controls by role, and the API enforces it.
* **Tenancy**: inventory, history, reports and CRUD are scoped to the caller's company. The live snapshot is filtered by the dashboard's inventory join.
* **Dashboard socket** carries the JWT in the query string, because browsers cannot set headers on a WebSocket. Keep query strings out of proxy access logs.
* **CORS** allows exactly one origin, `CORS_ORIGIN`.
* **Databases** are published on 127.0.0.1 only by the compose file.
