// Command simulator replays a global hotel group's service robot fleet:
// cleaning, delivery, room service and reception robots in 20 hotels.
// Each robot opens its own WebSocket and reports once per interval.
// Activity follows the hotel's local time, batteries drain and recharge,
// and robots occasionally fault.
package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand/v2"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
	_ "time/tzdata" // distroless images ship without zoneinfo

	"github.com/gorilla/websocket"
)

// hotel-fleet.json is also the demo inventory the orchestration API seeds into PostgreSQL.
//
//go:embed hotel-fleet.json
var fleetJSON []byte

type fleet struct {
	Sites []struct {
		ID        string
		Latitude  float64
		Longitude float64
		Timezone  string
	}
	Robots []robotSpec
}

type robotSpec struct {
	ID          string
	Kind        string
	SiteID      string
	MaxSpeedMps float64
}

// siteRadiusDeg keeps robots within roughly 75m of the hotel's centre.
const siteRadiusDeg = 0.0007

func main() {
	url := flag.String("url", "ws://localhost:8080", "ingestion service base URL")
	count := flag.Int("n", 0, "number of robots to simulate (0 means the whole fleet)")
	interval := flag.Duration("interval", time.Second, "send interval per robot")
	flag.Parse()

	var f fleet
	if err := json.Unmarshal(fleetJSON, &f); err != nil {
		log.Fatalf("fleet fixture: %v", err)
	}
	robots := f.Robots
	if *count > 0 && *count < len(robots) {
		robots = robots[:*count]
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var wg sync.WaitGroup
	for _, spec := range robots {
		s := newSim(spec, f)
		wg.Add(1)
		go func() {
			defer wg.Done()
			run(ctx, *url, s, *interval)
		}()
		// Stagger dials so the server is not hit by 1,000 handshakes at once.
		time.Sleep(2 * time.Millisecond)
	}
	log.Printf("simulating %d robots in %d hotels", len(robots), len(f.Sites))
	wg.Wait()
}

type sim struct {
	spec       robotSpec
	loc        *time.Location
	lat0, lon0 float64
	lat, lon   float64
	battery    float64
	status     string
	task       string
	taskTicks  int
	errorTicks int
}

func newSim(spec robotSpec, f fleet) *sim {
	s := &sim{spec: spec, loc: time.UTC, battery: 20 + rand.Float64()*80, status: "idle", task: "awaiting_dispatch", taskTicks: rand.IntN(10)}
	for _, site := range f.Sites {
		if site.ID != spec.SiteID {
			continue
		}
		if loc, err := time.LoadLocation(site.Timezone); err == nil {
			s.loc = loc
		}
		s.lat0, s.lon0 = site.Latitude, site.Longitude
	}
	s.lat = s.lat0 + (rand.Float64()-0.5)*siteRadiusDeg
	s.lon = s.lon0 + (rand.Float64()-0.5)*siteRadiusDeg
	return s
}

// step advances the robot by one tick and returns its current speed.
func (s *sim) step(now time.Time) float64 {
	switch s.status {
	case "error":
		if s.errorTicks--; s.errorTicks <= 0 {
			s.status, s.task = "idle", "awaiting_dispatch"
		}
		return 0
	case "charging":
		if s.battery = min(100, s.battery+0.25); s.battery >= 95 {
			s.status, s.task = "idle", "awaiting_dispatch"
		}
		return 0
	}
	if rand.Float64() < 0.0001 {
		s.status, s.errorTicks = "error", 30+rand.IntN(240)
		return 0
	}
	if s.battery < 15 {
		s.status, s.task = "charging", "dock_charging"
		return 0
	}
	if s.taskTicks--; s.taskTicks <= 0 {
		s.taskTicks = 20 + rand.IntN(100)
		if rand.Float64() < busyProbability(s.spec.Kind, now.In(s.loc).Hour()) {
			s.status, s.task = "active", nextTask(s.spec.Kind)
		} else {
			s.status, s.task = "idle", "awaiting_dispatch"
		}
	}
	if s.status != "active" {
		return 0
	}
	s.battery = max(0, s.battery-0.03)
	s.lat = clamp(s.lat+(rand.Float64()-0.5)*0.00004, s.lat0)
	s.lon = clamp(s.lon+(rand.Float64()-0.5)*0.00004, s.lon0)
	return s.spec.MaxSpeedMps * (0.4 + 0.6*rand.Float64())
}

func clamp(v, centre float64) float64 {
	return math.Max(centre-siteRadiusDeg, math.Min(centre+siteRadiusDeg, v))
}

// busyProbability models hotel rhythm: cleaning peaks at night, guest facing robots by day.
func busyProbability(kind string, hour int) float64 {
	day := hour >= 7 && hour < 23
	switch kind {
	case "cleaning":
		if day {
			return 0.45
		}
		return 0.85
	case "reception":
		if day {
			return 0.9
		}
		return 0.3
	default:
		if day {
			return 0.75
		}
		return 0.2
	}
}

func nextTask(kind string) string {
	floor := 2 + rand.IntN(19)
	elevator := rand.Float64() < 0.3
	bank := string(rune('a' + rand.IntN(2)))
	switch kind {
	case "cleaning":
		return []string{"scrub_lobby", "scrub_restaurant", "vacuum_ballroom", fmt.Sprintf("vacuum_corridor_f%d", floor)}[rand.IntN(4)]
	case "delivery":
		if elevator {
			return "ride_elevator_bank_" + bank
		}
		return []string{"pickup_kitchen", fmt.Sprintf("deliver_room_%d%02d", floor, 1+rand.IntN(40))}[rand.IntN(2)]
	case "room_service":
		if elevator {
			return "ride_elevator_bank_" + bank
		}
		return fmt.Sprintf("restock_minibar_f%d", floor)
	default:
		return []string{"greet_lobby", "guide_to_elevator", "checkin_assist"}[rand.IntN(3)]
	}
}

func run(ctx context.Context, base string, s *sim, interval time.Duration) {
	for ctx.Err() == nil {
		conn, _, err := websocket.DefaultDialer.DialContext(ctx, base+"/ws/robot/"+s.spec.ID, nil)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		// Drain acks so the server never blocks on a full socket buffer.
		go func() {
			for {
				if _, _, err := conn.ReadMessage(); err != nil {
					return
				}
			}
		}()

		ticker := time.NewTicker(interval)
	send:
		for {
			select {
			case <-ctx.Done():
				break send
			case now := <-ticker.C:
				speed := s.step(now)
				err := conn.WriteJSON(map[string]any{
					"robot_id": s.spec.ID,
					"status":   s.status,
					"telemetry": map[string]float64{
						"latitude":    s.lat,
						"longitude":   s.lon,
						"speed_mps":   speed,
						"battery_pct": s.battery,
					},
					"current_task": s.task,
					"timestamp":    now.UTC().Format(time.RFC3339Nano),
				})
				if err != nil {
					break send
				}
			}
		}
		ticker.Stop()
		conn.Close()
	}
}
