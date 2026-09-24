'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FilterBar } from '@/components/FilterBar';
import { isLowBattery, REPORTS, type ReportSlug } from '@/components/ReportCards';
import { StatusBadge } from '@/components/StatusBadge';
import { api, type ActivityRow, type Site } from '@/lib/api';
import { useFleet } from '@/lib/fleet-store';
import { availability, countByStatus, KIND_LABELS, pct, REGION_LABELS, useFilters, useFleetRows, type FleetRow } from '@/lib/fleet-view';

export default function ReportPage() {
  const { report } = useParams<{ report: string }>();
  const { filters, query } = useFilters();
  const rows = useFleetRows(useMemo(() => ({ ...filters, status: undefined }), [filters]));

  if (!(report in REPORTS)) return <p>Unknown report.</p>;
  const slug = report as ReportSlug;
  const def = REPORTS[slug];

  return (
    <>
      <Link href={`/reports${query}`} className="flex w-fit items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100">
        <ArrowLeft className="size-4" aria-hidden />
        Reports
      </Link>
      <h1 className="text-xl font-semibold">{def.title}</h1>
      <p className="text-sm text-zinc-400">{def.description}</p>
      <FilterBar hide={['status']} />
      <div className="overflow-x-auto rounded-lg bg-zinc-900">
        {slug === 'availability' && <AvailabilityReport rows={rows} />}
        {slug === 'battery' && <RobotListReport rows={rows.filter(isLowBattery).sort((a, b) => a.state!.batteryPct - b.state!.batteryPct)} empty="No robot is low on battery." />}
        {slug === 'incidents' && <RobotListReport rows={rows.filter((r) => r.status === 'error')} empty="No open incidents." />}
        {slug === 'activity' && <ActivityReport rows={rows} />}
      </div>
    </>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-zinc-400">
        <tr>
          {head.map((h) => (
            <th key={h} className="px-4 py-3 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="[&_td]:border-t [&_td]:border-zinc-800 [&_td]:px-4 [&_td]:py-2">{children}</tbody>
    </table>
  );
}

const SiteLink = ({ site, id }: { site: Site | undefined; id: string }) => (
  <Link href={`/sites/${id}`} className="text-emerald-300 hover:underline">
    {site?.name ?? id}
  </Link>
);

function AvailabilityReport({ rows }: { rows: FleetRow[] }) {
  const sites = useFleet((s) => s.sites);
  const bySite = Object.entries(Object.groupBy(rows, (r) => r.info.siteId))
    .map(([id, group = []]) => ({ id, group, value: availability(group), c: countByStatus(group) }))
    .sort((a, b) => a.value - b.value);
  return (
    <Table head={['Hotel', 'Region', 'Robots', 'Active', 'Idle', 'Charging', 'Error', 'Offline', 'Availability']}>
      {bySite.map(({ id, group, value, c }) => (
        <tr key={id}>
          <td>
            <SiteLink site={sites[id]} id={id} />
          </td>
          <td>{REGION_LABELS[sites[id]?.region ?? ''] ?? ''}</td>
          <td className="font-mono">{group.length}</td>
          <td className="font-mono">{c.active}</td>
          <td className="font-mono">{c.idle}</td>
          <td className="font-mono">{c.charging}</td>
          <td className={`font-mono ${c.error ? 'text-red-400' : ''}`}>
            {c.error ? <Link href={`/reports/incidents?site=${id}`} className="hover:underline">{c.error}</Link> : 0}
          </td>
          <td className="font-mono">{c.offline}</td>
          <td className="font-mono">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded bg-zinc-800" aria-hidden>
                <span className="block h-full bg-emerald-500" style={{ width: pct(value) }} />
              </span>
              {pct(value)}
            </span>
          </td>
        </tr>
      ))}
    </Table>
  );
}

function RobotListReport({ rows, empty }: { rows: FleetRow[]; empty: string }) {
  if (rows.length === 0) return <p className="p-4 text-zinc-400">{empty}</p>;
  return (
    <Table head={['Robot', 'Hotel', 'Type', 'Status', 'Battery', 'Task', 'Last report']}>
      {rows.map((r) => (
        <tr key={r.info.id}>
          <td className="font-mono">
            <Link href={`/robots/${r.info.id}`} className="text-emerald-300 hover:underline">
              {r.info.id}
            </Link>
          </td>
          <td>
            <SiteLink site={r.site} id={r.info.siteId} />
          </td>
          <td>{KIND_LABELS[r.info.kind]}</td>
          <td>
            <StatusBadge status={r.status} />
          </td>
          <td className="font-mono">{r.state?.batteryPct.toFixed(1)}%</td>
          <td className="font-mono text-zinc-400">{r.state?.currentTask}</td>
          <td className="text-zinc-400">{r.state ? new Date(r.state.timestamp).toLocaleTimeString() : ''}</td>
        </tr>
      ))}
    </Table>
  );
}

const WINDOWS = [1, 6, 24];

function ActivityReport({ rows }: { rows: FleetRow[] }) {
  const token = useFleet((s) => s.token);
  const sites = useFleet((s) => s.sites);
  const [hours, setHours] = useState(1);
  const [data, setData] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setData(null);
    api
      .activity(token, hours)
      .then((r) => !cancelled && setData(r.rows))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Report failed'));
    return () => {
      cancelled = true;
    };
  }, [token, hours]);

  // The API reports on the whole company; apply the page filters here.
  const visible = useMemo(() => {
    const keys = new Set(rows.map((r) => `${r.info.siteId}/${r.info.kind}`));
    return (data ?? [])
      .filter((a) => keys.has(`${a.siteId}/${a.kind}`))
      .sort((a, b) => (sites[a.siteId]?.name ?? a.siteId).localeCompare(sites[b.siteId]?.name ?? b.siteId) || a.kind.localeCompare(b.kind));
  }, [data, rows, sites]);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-zinc-800 p-3 text-sm" role="group" aria-label="Time window">
        {WINDOWS.map((h) => (
          <button
            key={h}
            type="button"
            aria-pressed={hours === h}
            onClick={() => setHours(h)}
            className={`rounded-md px-3 py-1 ${hours === h ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'}`}
          >
            Last {h}h
          </button>
        ))}
      </div>
      {error && <p className="p-4 text-red-400">{error}</p>}
      {!data && !error && <p className="p-4 text-zinc-400">Aggregating telemetry history</p>}
      {data && (
        <Table head={['Hotel', 'Type', 'Robots', 'Tasks started', 'Tasks per robot', 'Elevator rides', 'Faults', 'Avg battery']}>
          {visible.map((a) => (
            <tr key={`${a.siteId}/${a.kind}`}>
              <td>
                <SiteLink site={sites[a.siteId]} id={a.siteId} />
              </td>
              <td>
                <Link href={`/sites/${a.siteId}?kind=${a.kind}`} className="hover:underline">
                  {KIND_LABELS[a.kind]}
                </Link>
              </td>
              <td className="font-mono">{a.robots}</td>
              <td className="font-mono">{a.tasksStarted}</td>
              <td className="font-mono">{(a.tasksStarted / a.robots).toFixed(1)}</td>
              <td className="font-mono">{a.kind === 'delivery' || a.kind === 'room_service' ? a.elevatorRides : '·'}</td>
              <td className={`font-mono ${a.faults ? 'text-red-400' : ''}`}>{a.faults}</td>
              <td className="font-mono">{a.avgBattery === null ? '·' : `${a.avgBattery.toFixed(1)}%`}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
