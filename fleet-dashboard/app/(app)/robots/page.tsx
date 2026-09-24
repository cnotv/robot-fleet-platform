'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { FilterBar } from '@/components/FilterBar';
import { RobotTable } from '@/components/RobotTable';
import { useFleet } from '@/lib/fleet-store';
import { useFilters, useFleetRows } from '@/lib/fleet-view';

export default function RobotsPage() {
  const { filters } = useFilters();
  const rows = useFleetRows(filters);
  const canWrite = useFleet((s) => s.role !== 'viewer');

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Robot inventory</h1>
        {canWrite && (
          <Link href="/robots/new" className="flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950">
            <Plus className="size-4" aria-hidden />
            Add robot
          </Link>
        )}
      </div>
      <p className="text-sm text-zinc-400">
        {rows.length} robots. Open a robot to see its history, edit its record or remove it from the fleet.
      </p>
      <FilterBar />
      <section aria-label="Robots" className="h-[calc(100dvh-16rem)] min-h-96">
        <RobotTable rows={rows} />
      </section>
    </>
  );
}
