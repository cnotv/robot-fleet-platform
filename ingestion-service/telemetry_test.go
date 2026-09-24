package main

import (
	"strings"
	"testing"
	"time"
)

var testNow = time.Date(2026, 9, 24, 0, 0, 1, 0, time.UTC)

const validPacket = `{
  "robot_id": "rob-v-10049",
  "status": "active",
  "telemetry": {"latitude": 48.1351, "longitude": 11.5820, "speed_mps": 1.2, "battery_pct": 84.5},
  "current_task": " floor_scrub_zone_b ",
  "timestamp": "2026-09-24T00:00:00Z"
}`

func TestParsePacketsMapsWireFormat(t *testing.T) {
	got, err := ParsePackets([]byte(validPacket), "rob-v-10049", testNow)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("want 1 packet, got %d", len(got))
	}
	p := got[0]
	if p.RobotID != "rob-v-10049" || p.Status != StatusActive {
		t.Errorf("identity not mapped: %+v", p)
	}
	if p.Telemetry != (Telemetry{Latitude: 48.1351, Longitude: 11.5820, SpeedMps: 1.2, BatteryPct: 84.5}) {
		t.Errorf("telemetry not mapped: %+v", p.Telemetry)
	}
	if p.CurrentTask != "floor_scrub_zone_b" {
		t.Errorf("task not trimmed: %q", p.CurrentTask)
	}
	if !p.IngestedAt.Equal(testNow) {
		t.Errorf("ingested_at = %v, want %v", p.IngestedAt, testNow)
	}
}

func TestParsePacketsAcceptsArray(t *testing.T) {
	got, err := ParsePackets([]byte("["+validPacket+","+validPacket+"]"), "rob-v-10049", testNow)
	if err != nil || len(got) != 2 {
		t.Fatalf("want 2 packets, got %d (err %v)", len(got), err)
	}
}

func TestParsePacketsRejects(t *testing.T) {
	cases := map[string]string{
		"spoofed robot id": strings.Replace(validPacket, "rob-v-10049", "rob-v-99999", 1),
		"unknown status":   strings.Replace(validPacket, `"active"`, `"exploded"`, 1),
		"battery range":    strings.Replace(validPacket, "84.5", "184.5", 1),
		"latitude range":   strings.Replace(validPacket, "48.1351", "98.1", 1),
		"unknown field":    strings.Replace(validPacket, `"status"`, `"extra": 1, "status"`, 1),
		"missing field":    strings.Replace(validPacket, `"current_task": " floor_scrub_zone_b ",`, "", 1),
		"bad task chars":   strings.Replace(validPacket, "floor_scrub_zone_b", "<script>", 1),
		"future timestamp": strings.Replace(validPacket, "2026-09-24T00:00:00Z", "2026-09-25T00:00:00Z", 1),
		"empty array":      `[]`,
		"oversized batch":  "[" + strings.Repeat(validPacket+",", maxBatch) + validPacket + "]",
		"trailing data":    validPacket + " x",
		"not json":         `hello`,
	}
	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := ParsePackets([]byte(payload), "rob-v-10049", testNow); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}
