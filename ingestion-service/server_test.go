package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type fakePublisher struct {
	mu       sync.Mutex
	messages [][]byte
}

func (f *fakePublisher) Publish(_ context.Context, payload []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.messages = append(f.messages, payload)
	return nil
}

func (f *fakePublisher) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.messages)
}

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func startServer(t *testing.T) (*fakePublisher, *fakeClock, string) {
	t.Helper()
	pub := &fakePublisher{}
	clock := &fakeClock{t: testNow}
	srv := NewServer(pub, 500*time.Millisecond, slog.New(slog.NewTextHandler(io.Discard, nil)))
	srv.now = clock.now
	ts := httptest.NewServer(srv.Routes())
	t.Cleanup(ts.Close)
	return pub, clock, "ws" + strings.TrimPrefix(ts.URL, "http")
}

func dial(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("handshake failed: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func send(t *testing.T, conn *websocket.Conn, payload string) Ack {
	t.Helper()
	if err := conn.WriteMessage(websocket.TextMessage, []byte(payload)); err != nil {
		t.Fatalf("write: %v", err)
	}
	var ack Ack
	if err := conn.ReadJSON(&ack); err != nil {
		t.Fatalf("read ack: %v", err)
	}
	return ack
}

func TestHandshakePublishesSanitizedPacket(t *testing.T) {
	pub, _, base := startServer(t)
	conn := dial(t, base+"/ws/robot/rob-v-10049")

	if ack := send(t, conn, validPacket); !ack.OK {
		t.Fatalf("ack error: %s", ack.Error)
	}
	if pub.count() != 1 {
		t.Fatalf("want 1 published message, got %d", pub.count())
	}
	pub.mu.Lock()
	msg := pub.messages[0]
	pub.mu.Unlock()
	var p Packet
	if err := json.Unmarshal(msg, &p); err != nil {
		t.Fatal(err)
	}
	if p.RobotID != "rob-v-10049" || p.Telemetry.BatteryPct != 84.5 {
		t.Errorf("unexpected packet: %+v", p)
	}
}

func TestHandshakeRejectsInvalidRobotID(t *testing.T) {
	_, _, base := startServer(t)
	_, resp, err := websocket.DefaultDialer.Dial(base+"/ws/robot/NOT_VALID", nil)
	if err == nil {
		t.Fatal("expected handshake to fail")
	}
	if resp == nil || resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("want 400, got %v", resp)
	}
}

func TestThrottleAllowsOnePacketPer500ms(t *testing.T) {
	pub, clock, base := startServer(t)
	conn := dial(t, base+"/ws/robot/rob-v-10049")

	if ack := send(t, conn, validPacket); !ack.OK {
		t.Fatalf("first packet rejected: %s", ack.Error)
	}
	clock.advance(499 * time.Millisecond)
	if ack := send(t, conn, validPacket); ack.Error != "throttled" {
		t.Fatalf("want throttled, got %+v", ack)
	}
	clock.advance(time.Millisecond)
	if ack := send(t, conn, validPacket); !ack.OK {
		t.Fatalf("packet after window rejected: %s", ack.Error)
	}
	if pub.count() != 2 {
		t.Fatalf("want 2 published messages, got %d", pub.count())
	}
}

func TestInvalidPayloadIsReportedNotPublished(t *testing.T) {
	pub, _, base := startServer(t)
	conn := dial(t, base+"/ws/robot/rob-v-10049")

	if ack := send(t, conn, `{"robot_id":"rob-v-10049"}`); ack.OK || ack.Error == "" {
		t.Fatalf("want error ack, got %+v", ack)
	}
	if pub.count() != 0 {
		t.Fatalf("invalid payload was published")
	}
}
