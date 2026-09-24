// Command simulator opens one WebSocket per virtual robot and streams
// random walk telemetry to the ingestion service.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand/v2"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

var statuses = []string{"active", "active", "active", "charging", "idle", "error"}

func main() {
	url := flag.String("url", "ws://localhost:8080", "ingestion service base URL")
	count := flag.Int("n", 1000, "number of virtual robots")
	interval := flag.Duration("interval", time.Second, "send interval per robot")
	flag.Parse()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var wg sync.WaitGroup
	for i := range *count {
		wg.Add(1)
		go func() {
			defer wg.Done()
			robot(ctx, *url, fmt.Sprintf("rob-v-%05d", 10000+i), *interval)
		}()
		// Stagger dials so the server is not hit by 1,000 handshakes at once.
		time.Sleep(2 * time.Millisecond)
	}
	log.Printf("simulating %d robots", *count)
	wg.Wait()
}

func robot(ctx context.Context, base, id string, interval time.Duration) {
	lat := 48.1351 + (rand.Float64()-0.5)*0.05
	lon := 11.5820 + (rand.Float64()-0.5)*0.08
	battery := 20 + rand.Float64()*80
	status := statuses[rand.IntN(len(statuses))]

	for ctx.Err() == nil {
		conn, _, err := websocket.DefaultDialer.DialContext(ctx, base+"/ws/robot/"+id, nil)
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
		for ctx.Err() == nil {
			<-ticker.C
			if rand.IntN(50) == 0 {
				status = statuses[rand.IntN(len(statuses))]
			}
			speed := 0.0
			if status == "active" {
				speed = 0.5 + rand.Float64()
				lat += (rand.Float64() - 0.5) * 0.0004
				lon += (rand.Float64() - 0.5) * 0.0006
				battery = max(0, battery-0.05)
			}
			if status == "charging" {
				battery = min(100, battery+0.2)
			}
			err := conn.WriteJSON(map[string]any{
				"robot_id": id,
				"status":   status,
				"telemetry": map[string]float64{
					"latitude":    lat,
					"longitude":   lon,
					"speed_mps":   speed,
					"battery_pct": battery,
				},
				"current_task": "floor_scrub_zone_" + string(rune('a'+rand.IntN(4))),
				"timestamp":    time.Now().UTC().Format(time.RFC3339Nano),
			})
			if err != nil {
				break
			}
		}
		ticker.Stop()
		conn.Close()
	}
}
