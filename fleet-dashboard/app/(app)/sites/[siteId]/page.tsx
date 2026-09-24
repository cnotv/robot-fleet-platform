'use client';

import { ArrowLeft, Clock, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { FilterBar } from '@/components/FilterBar';
import { FleetMap } from '@/components/FleetMap';
import { FleetStats } from '@/components/FleetStats';
import { ReportCards } from '@/components/ReportCards';
import { RobotTable } from '@/components/RobotTable';
import { ROBOT_KINDS } from '@/lib/api';
import { useFleet } from '@/lib/fleet-store';
import { availability, countByStatus, KIND_LABELS, pct, REGION_LABELS, useFilters, useFleetRows } from '@/lib/fleet-view';

export default function SitePage() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useFleet((s) => s.sites[siteId]);
  const { filters } = useFilters();
  const scoped = useMemo(() => ({ kind: filters.kind, status: filters.status, site: siteId }), [filters.kind, filters.status, siteId]);
  const rows = useFleetRows(scoped);
  const allAtSite = useFleetRows(useMemo(() => ({ site: siteId }), [siteId]));

  if (!site) return <p>Hotel {siteId} not found.</p>;
  const localTime = new Date().toLocaleTimeString([], { timeZone: site.timezone, hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <Link href={`/?region=${site.region}`} className="flex w-fit items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100">
        <ArrowLeft className="size-4" aria-hidden />
        {REGION_LABELS[site.region] ?? site.region}
      </Link>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold">{site.name}</h1>
        <span className="flex items-center gap-1 text-sm text-zinc-400">
          <MapPin className="size-4" aria-hidden />
          {site.city}, {site.country}
        </span>
        <span className="flex items-center gap-1 text-sm text-zinc-400">
          <Clock className="size-4" aria-hidden />
          {localTime} local time
        </span>
      </div>
      <FilterBar hide={['region', 'country', 'site']} />
      <FleetStats rows={rows} />
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <section aria-label="Map of the hotel" className="h-[30rem]">
          <FleetMap rows={rows} fitKey={`site:${siteId}`} />
        </section>
        <section aria-labelledby="kinds-heading" className="rounded-lg bg-zinc-900 p-4">
          <h2 id="kinds-heading" className="mb-3 font-medium">
            By robot type
          </h2>
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-400">
              <tr>
                <th className="py-1 font-normal">Type</th>
                <th className="py-1 font-normal">Robots</th>
                <th className="py-1 font-normal">Active</th>
                <th className="py-1 font-normal">Errors</th>
                <th className="py-1 font-normal">Availability</th>
              </tr>
            </thead>
            <tbody>
              {ROBOT_KINDS.map((kind) => {
                const group = allAtSite.filter((r) => r.info.kind === kind);
                const c = countByStatus(group);
                return (
                  <tr key={kind} className="border-t border-zinc-800">
                    <td className="py-2">
                      <Link href={`/sites/${siteId}?kind=${kind}`} className="hover:underline">
                        {KIND_LABELS[kind]}
                      </Link>
                    </td>
                    <td className="font-mono">{group.length}</td>
                    <td className="font-mono">{c.active}</td>
                    <td className={`font-mono ${c.error ? 'text-red-400' : ''}`}>{c.error}</td>
                    <td className="font-mono">{pct(availability(group))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
      <section aria-label="Robots at this hotel" className="h-96">
        <RobotTable rows={rows} />
      </section>
      <section aria-labelledby="site-reports" className="flex flex-col gap-3">
        <h2 id="site-reports" className="text-lg font-semibold">
          Reports for this hotel
        </h2>
        <ReportCards rows={allAtSite} query={`?site=${siteId}`} />
      </section>
    </>
  );
}
