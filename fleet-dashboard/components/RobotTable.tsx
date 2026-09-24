'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';
import { useFleet } from '@/lib/fleet-store';
import { STATUS_COLORS } from './FleetMap';

const ROW_HEIGHT = 36;
const COLUMNS = 'grid grid-cols-[8rem_6rem_5rem_5rem_1fr] gap-3 px-3';

/** Virtualized list: only rows inside the viewport exist in the DOM. */
export function RobotTable() {
  const robots = useFleet((s) => s.robots);
  const rows = useMemo(
    () => Object.values(robots).sort((a, b) => a.robotId.localeCompare(b.robotId)),
    [robots],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg bg-zinc-900 text-sm" role="table" aria-rowcount={rows.length}>
      <div className={`${COLUMNS} border-b border-zinc-800 py-2 font-medium text-zinc-400`} role="row">
        <span role="columnheader">Robot</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Battery</span>
        <span role="columnheader">Speed</span>
        <span role="columnheader">Task</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const r = rows[item.index];
            if (!r) return null;
            return (
              <div
                key={r.robotId}
                role="row"
                aria-rowindex={item.index + 1}
                className={`${COLUMNS} absolute inset-x-0 items-center border-b border-zinc-800/60 font-mono`}
                style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
              >
                <span role="cell">{r.robotId}</span>
                <span role="cell" className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: STATUS_COLORS[r.status] }} aria-hidden />
                  {r.status}
                </span>
                <span role="cell" className={r.batteryPct < 20 ? 'text-red-400' : undefined}>
                  {r.batteryPct.toFixed(1)}%
                </span>
                <span role="cell">{r.speedMps.toFixed(2)} m/s</span>
                <span role="cell" className="truncate text-zinc-400">
                  {r.currentTask}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
