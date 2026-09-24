package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const (
	TelemetryChannel = "robot:telemetry:live"
	idleTimeout      = 60 * time.Second
	publishTimeout   = 2 * time.Second
)

// Publisher sends a sanitized packet to the message bus.
type Publisher interface {
	Publish(ctx context.Context, payload []byte) error
}

// Ack is written back to the robot for every frame it sends.
type Ack struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

type Server struct {
	pub      Publisher
	throttle time.Duration
	now      func() time.Time
	log      *slog.Logger
	upgrader websocket.Upgrader
}

func NewServer(pub Publisher, throttle time.Duration, log *slog.Logger) *Server {
	return &Server{
		pub:      pub,
		throttle: throttle,
		now:      time.Now,
		log:      log,
		upgrader: websocket.Upgrader{ReadBufferSize: 1024, WriteBufferSize: 256},
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws/robot/{id}", s.handleRobot)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	return mux
}

func (s *Server) handleRobot(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !robotIDPattern.MatchString(id) {
		http.Error(w, "invalid robot id", http.StatusBadRequest)
		return
	}
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		// Upgrade already wrote the HTTP error response.
		return
	}
	go s.serveRobot(conn, id)
}

// serveRobot runs in a dedicated goroutine for the lifetime of one robot connection.
func (s *Server) serveRobot(conn *websocket.Conn, id string) {
	defer conn.Close()
	conn.SetReadLimit(maxMessageBytes)
	log := s.log.With("robot_id", id)
	log.Debug("robot connected")

	var lastAccepted time.Time
	for {
		if err := conn.SetReadDeadline(time.Now().Add(idleTimeout)); err != nil {
			return
		}
		_, data, err := conn.ReadMessage()
		if err != nil {
			log.Debug("robot disconnected", "err", err)
			return
		}

		now := s.now()
		if !lastAccepted.IsZero() && now.Sub(lastAccepted) < s.throttle {
			if s.reply(conn, Ack{Error: "throttled"}) != nil {
				return
			}
			continue
		}
		// Invalid frames also consume the window so garbage cannot bypass the throttle.
		lastAccepted = now

		packets, err := ParsePackets(data, id, now)
		if err != nil {
			if s.reply(conn, Ack{Error: err.Error()}) != nil {
				return
			}
			continue
		}

		ack := Ack{OK: true}
		for _, p := range packets {
			if err := s.publish(p); err != nil {
				log.Error("publish failed", "err", err)
				ack = Ack{Error: "publish failed"}
				break
			}
		}
		if s.reply(conn, ack) != nil {
			return
		}
	}
}

func (s *Server) publish(p Packet) error {
	payload, err := json.Marshal(p)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), publishTimeout)
	defer cancel()
	return s.pub.Publish(ctx, payload)
}

func (s *Server) reply(conn *websocket.Conn, ack Ack) error {
	if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return err
	}
	return conn.WriteJSON(ack)
}
