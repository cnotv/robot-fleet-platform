package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
)

type redisPublisher struct {
	client  *redis.Client
	channel string
}

func (p redisPublisher) Publish(ctx context.Context, payload []byte) error {
	return p.client.Publish(ctx, p.channel, payload).Err()
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("ingestion service stopped", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	opts, err := redis.ParseURL(env("REDIS_URL", "redis://localhost:6379"))
	if err != nil {
		return err
	}
	client := redis.NewClient(opts)
	defer client.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := client.Ping(ctx).Err(); err != nil {
		return err
	}

	srv := NewServer(redisPublisher{client: client, channel: TelemetryChannel}, 500*time.Millisecond, log)
	httpSrv := &http.Server{
		Addr:              env("ADDR", ":8080"),
		Handler:           srv.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(shutdownCtx)
	}()

	log.Info("ingestion service listening", "addr", httpSrv.Addr)
	if err := httpSrv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
