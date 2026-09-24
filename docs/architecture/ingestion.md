# Ingestion service

Go, `net/http`, `gorilla/websocket`, `go-redis`. Source: `ingestion-service/`.

## Behaviour

* `GET /ws/robot/{id}` upgrades to a WebSocket. The id must match `^[a-z0-9][a-z0-9-]{0,63}$`, otherwise the handshake fails with 400.
* Each connection is served by its own goroutine.
* One frame per 500ms per connection is accepted. Extra frames get `{"ok":false,"error":"throttled"}`. Invalid frames also consume the window, so garbage cannot bypass the throttle.
* A frame holds one packet object or an array of up to 5 packets. Decoding is strict: unknown fields, missing fields, out of range values, a `robot_id` that differs from the connection id and timestamps more than 30s in the future are rejected with the reason in the ack.
* Accepted packets gain `ingested_at` and are published to `robot:telemetry:live`.
* The service is stateless and scales horizontally behind any load balancer that supports WebSockets.

## Simulator

`cmd/simulator` embeds `hotel-fleet.json` and opens one socket per robot. See [Customer use case](/guide/use-case) for the behaviour it models.

```sh
go run ./cmd/simulator -url ws://localhost:8080 -n 1000 -interval 1s
```

## Tests

`telemetry_test.go` covers packet mapping and every rejection rule. `server_test.go` covers the handshake, invalid ids, the throttle window and error acks, using an in memory publisher and a fake clock.
