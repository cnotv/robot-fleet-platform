'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import Link from 'next/link';
import { useRef } from 'react';
import { KIND_LABELS, type FleetRow } from '@/lib/fleet-view';
import { StatusBadge } from './StatusBadge';

const ROW_HEIGHT = 36;
const COLUMNS = 'grid grid-cols-[7rem_10rem_7rem_6rem_4.5rem_1fr] gap-3 px-3';

/** Virtualized list: only rows inside the viewport exist in the DOM. */
export function RobotTable({ rows }: { rows: FleetRow[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-zinc-900 text-sm" role="table" aria-rowcount={rows.length}>
      <div className={`${COLUMNS} border-b border-zinc-800 py-2 font-medium text-zinc-400`} role="row">
        <span role="columnheader">Robot</span>
        <span role="columnheader">Hotel</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Battery</span>
        <span role="columnheader">Task</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {rows.length === 0 && <p className="p-4 text-zinc-500">No robots match the filters.</p>}
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const r = rows[item.index];
            if (!r) return null;
            return (
              <div
                key={r.info.id}
                role="row"
                aria-rowindex={item.index + 1}
                className={`${COLUMNS} absolute inset-x-0 items-center border-b border-zinc-800/60 hover:bg-zinc-800/50`}
                style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
              >
                <span role="cell" className="font-mono">
                  <Link href={`/robots/${r.info.id}`} className="text-emerald-300 hover:underline">
                    {r.info.id}
                  </Link>
                </span>
                <span role="cell" className="truncate">
                  <Link href={`/sites/${r.info.siteId}`} className="hover:underline">
                    {r.site?.name ?? r.info.siteId}
                  </Link>
                </span>
                <span role="cell">{KIND_LABELS[r.info.kind]}</span>
                <span role="cell">
                  <StatusBadge status={r.status} />
                </span>
                <span role="cell" className={`font-mono ${r.state && r.state.batteryPct < 20 ? 'text-red-400' : ''}`}>
                  {r.state ? `${r.state.batteryPct.toFixed(0)}%` : '·'}
                </span>
                <span role="cell" className="truncate font-mono text-zinc-400">
                  {r.state?.currentTask ?? 'no telemetry yet'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
