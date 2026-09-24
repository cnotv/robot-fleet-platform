'use client';

import { FilterBar } from '@/components/FilterBar';
import { ReportCards } from '@/components/ReportCards';
import { useFilters, useFleetRows } from '@/lib/fleet-view';

export default function ReportsPage() {
  const { filters } = useFilters();
  const rows = useFleetRows(filters);
  return (
    <>
      <h1 className="text-xl font-semibold">Reports</h1>
      <p className="text-sm text-zinc-400">Every report follows the filters below. Rows link to the hotel or robot behind them.</p>
      <FilterBar hide={['status']} />
      <ReportCards rows={rows} />
    </>
  );
}
