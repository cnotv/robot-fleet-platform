'use client';

import { useEffect, useRef } from 'react';
import type { RobotState, RobotStatus } from '@/lib/api';
import { useFleet } from '@/lib/fleet-store';

export const STATUS_COLORS: Record<RobotStatus, string> = {
  active: '#34d399',
  charging: '#60a5fa',
  error: '#f87171',
  idle: '#a1a1aa',
};

const PADDING = 24;
const DOT = 4;

/**
 * Canvas map placeholder. Draws every robot as a dot on a fitted lat/lng
 * plane. It reads the store outside React and repaints in a
 * requestAnimationFrame only when data changed, so 1,000 nodes cost one
 * draw call batch per frame and zero React renders.
 * Swap drawRobots for a Mapbox or deck.gl layer when a real basemap is needed.
 */
export function FleetMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let dirty = true;
    let frame = 0;
    const markDirty = () => {
      dirty = true;
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      markDirty();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const unsubscribe = useFleet.subscribe((s, prev) => {
      if (s.robots !== prev.robots) markDirty();
    });

    const loop = () => {
      if (dirty) {
        dirty = false;
        drawRobots(ctx, canvas.clientWidth, canvas.clientHeight, Object.values(useFleet.getState().robots));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded-lg bg-zinc-900"
      role="img"
      aria-label="Map of robot positions coloured by status"
    />
  );
}

function drawRobots(ctx: CanvasRenderingContext2D, width: number, height: number, robots: RobotState[]) {
  ctx.clearRect(0, 0, width, height);
  if (robots.length === 0) return;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const r of robots) {
    minLat = Math.min(minLat, r.latitude);
    maxLat = Math.max(maxLat, r.latitude);
    minLon = Math.min(minLon, r.longitude);
    maxLon = Math.max(maxLon, r.longitude);
  }
  const spanLat = maxLat - minLat || 1e-6;
  const spanLon = maxLon - minLon || 1e-6;
  const w = width - PADDING * 2;
  const h = height - PADDING * 2;

  // One path per status keeps fillStyle changes to four per frame.
  for (const [status, color] of Object.entries(STATUS_COLORS)) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const r of robots) {
      if (r.status !== status) continue;
      const x = PADDING + ((r.longitude - minLon) / spanLon) * w;
      const y = PADDING + (1 - (r.latitude - minLat) / spanLat) * h;
      ctx.rect(x - DOT / 2, y - DOT / 2, DOT, DOT);
    }
    ctx.fill();
  }
}
