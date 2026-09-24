package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
)

type Status string

const (
	StatusActive   Status = "active"
	StatusCharging Status = "charging"
	StatusError    Status = "error"
	StatusIdle     Status = "idle"
)

func (s Status) valid() bool {
	switch s {
	case StatusActive, StatusCharging, StatusError, StatusIdle:
		return true
	}
	return false
}

// ponytail: a robot may batch a few samples in one frame; the cap keeps the
// 500ms throttle meaningful. Raise it only together with the throttle window.
const maxBatch = 5

const (
	maxTaskLen      = 128
	maxClockSkew    = 30 * time.Second
	maxSpeedMps     = 50.0
	maxMessageBytes = 8 << 10
)

var (
	robotIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)
	taskPattern    = regexp.MustCompile(`^[A-Za-z0-9_.:-]*$`)
)

type Telemetry struct {
	Latitude   float64 `json:"latitude"`
	Longitude  float64 `json:"longitude"`
	SpeedMps   float64 `json:"speed_mps"`
	BatteryPct float64 `json:"battery_pct"`
}

// Packet is the sanitized message published to Redis.
type Packet struct {
	RobotID     string    `json:"robot_id"`
	Status      Status    `json:"status"`
	Telemetry   Telemetry `json:"telemetry"`
	CurrentTask string    `json:"current_task"`
	Timestamp   time.Time `json:"timestamp"`
	IngestedAt  time.Time `json:"ingested_at"`
}

// rawPacket mirrors the wire format with pointers so missing fields are
// rejected instead of silently becoming zero.
type rawPacket struct {
	RobotID   *string `json:"robot_id"`
	Status    *Status `json:"status"`
	Telemetry *struct {
		Latitude   *float64 `json:"latitude"`
		Longitude  *float64 `json:"longitude"`
		SpeedMps   *float64 `json:"speed_mps"`
		BatteryPct *float64 `json:"battery_pct"`
	} `json:"telemetry"`
	CurrentTask *string    `json:"current_task"`
	Timestamp   *time.Time `json:"timestamp"`
}

// ParsePackets decodes a single packet object or an array of packets sent by
// the robot identified by robotID, and returns them sanitized.
func ParsePackets(data []byte, robotID string, now time.Time) ([]Packet, error) {
	data = bytes.TrimSpace(data)
	if len(data) == 0 {
		return nil, errors.New("empty payload")
	}

	var raws []rawPacket
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if data[0] == '[' {
		if err := dec.Decode(&raws); err != nil {
			return nil, fmt.Errorf("invalid json: %w", err)
		}
	} else {
		var one rawPacket
		if err := dec.Decode(&one); err != nil {
			return nil, fmt.Errorf("invalid json: %w", err)
		}
		raws = []rawPacket{one}
	}
	if dec.More() {
		return nil, errors.New("trailing data after json value")
	}
	if len(raws) == 0 || len(raws) > maxBatch {
		return nil, fmt.Errorf("batch must hold 1 to %d packets", maxBatch)
	}

	out := make([]Packet, 0, len(raws))
	for i, raw := range raws {
		p, err := sanitize(raw, robotID, now)
		if err != nil {
			return nil, fmt.Errorf("packet %d: %w", i, err)
		}
		out = append(out, p)
	}
	return out, nil
}

func sanitize(r rawPacket, robotID string, now time.Time) (Packet, error) {
	if r.RobotID == nil || r.Status == nil || r.Telemetry == nil || r.CurrentTask == nil || r.Timestamp == nil {
		return Packet{}, errors.New("missing required field")
	}
	t := r.Telemetry
	if t.Latitude == nil || t.Longitude == nil || t.SpeedMps == nil || t.BatteryPct == nil {
		return Packet{}, errors.New("missing telemetry field")
	}
	if *r.RobotID != robotID {
		return Packet{}, errors.New("robot_id does not match connection")
	}
	if !r.Status.valid() {
		return Packet{}, fmt.Errorf("unknown status %q", *r.Status)
	}
	if err := inRange("latitude", *t.Latitude, -90, 90); err != nil {
		return Packet{}, err
	}
	if err := inRange("longitude", *t.Longitude, -180, 180); err != nil {
		return Packet{}, err
	}
	if err := inRange("speed_mps", *t.SpeedMps, 0, maxSpeedMps); err != nil {
		return Packet{}, err
	}
	if err := inRange("battery_pct", *t.BatteryPct, 0, 100); err != nil {
		return Packet{}, err
	}
	task := strings.TrimSpace(*r.CurrentTask)
	if len(task) > maxTaskLen || !taskPattern.MatchString(task) {
		return Packet{}, errors.New("invalid current_task")
	}
	if r.Timestamp.After(now.Add(maxClockSkew)) {
		return Packet{}, errors.New("timestamp is in the future")
	}

	return Packet{
		RobotID: robotID,
		Status:  *r.Status,
		Telemetry: Telemetry{
			Latitude:   *t.Latitude,
			Longitude:  *t.Longitude,
			SpeedMps:   *t.SpeedMps,
			BatteryPct: *t.BatteryPct,
		},
		CurrentTask: task,
		Timestamp:   r.Timestamp.UTC(),
		IngestedAt:  now.UTC(),
	}, nil
}

func inRange(name string, v, lo, hi float64) error {
	if math.IsNaN(v) || v < lo || v > hi {
		return fmt.Errorf("%s out of range [%g, %g]", name, lo, hi)
	}
	return nil
}
