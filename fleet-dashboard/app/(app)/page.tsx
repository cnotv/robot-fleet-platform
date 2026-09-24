'use client';

import { FilterBar } from '@/components/FilterBar';
import { FleetMap } from '@/components/FleetMap';
import { FleetStats } from '@/components/FleetStats';
import { ReportCards } from '@/components/ReportCards';
import { RobotTable } from '@/components/RobotTable';
import { useFilters, useFleetRows } from '@/lib/fleet-view';

export default function OverviewPage() {
  const { filters, query } = useFilters();
  const rows = useFleetRows(filters);

  return (
    <>
      <h1 className="text-xl font-semibold">Global hotel group fleet</h1>
      <FilterBar />
      <FleetStats rows={rows} />
      <div className="grid min-h-[34rem] gap-4 xl:grid-cols-[3fr_2fr]">
        <section aria-label="Map" className="min-h-96">
          <FleetMap rows={rows} fitKey={query} />
        </section>
        <section aria-label="Robots" className="h-[34rem]">
          <RobotTable rows={rows} />
        </section>
      </div>
      <section aria-labelledby="reports-heading" className="flex flex-col gap-3">
        <h2 id="reports-heading" className="text-lg font-semibold">
          Reports
        </h2>
        <ReportCards rows={rows} />
      </section>
    </>
  );
}
