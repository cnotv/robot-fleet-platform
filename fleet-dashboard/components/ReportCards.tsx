'use client';

import { AlertTriangle, BatteryLow, ArrowUpDown, Gauge } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { availability, LOW_BATTERY_PCT, pct, useFilters, type FleetRow } from '@/lib/fleet-view';

export const REPORTS = {
  availability: {
    title: 'Availability by hotel',
    description: 'Share of robots online and fault free, per hotel. Lowest first.',
    icon: Gauge,
    metric: (rows: FleetRow[]) => pct(availability(rows)),
  },
  battery: {
    title: 'Low battery',
    description: `Robots below ${LOW_BATTERY_PCT}% that are not on a charger yet.`,
    icon: BatteryLow,
    metric: (rows: FleetRow[]) => String(rows.filter(isLowBattery).length),
  },
  incidents: {
    title: 'Open incidents',
    description: 'Robots reporting an error right now, with the task they were on.',
    icon: AlertTriangle,
    metric: (rows: FleetRow[]) => String(rows.filter((r) => r.status === 'error').length),
  },
  activity: {
    title: 'Tasks and elevator rides',
    description: 'Tasks started, elevator rides and faults per hotel and robot type, from the telemetry history.',
    icon: ArrowUpDown,
    metric: () => 'history',
  },
} satisfies Record<string, { title: string; description: string; icon: LucideIcon; metric: (rows: FleetRow[]) => string }>;

export type ReportSlug = keyof typeof REPORTS;

export function isLowBattery(r: FleetRow): boolean {
  return !!r.state && r.state.batteryPct < LOW_BATTERY_PCT && r.status !== 'charging';
}

/** One card per report. Links keep the active filters. */
export function ReportCards({ rows, query: fixedQuery }: { rows: FleetRow[]; query?: string }) {
  const { query } = useFilters();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {(Object.entries(REPORTS) as [ReportSlug, (typeof REPORTS)[ReportSlug]][]).map(([slug, report]) => {
        const Icon = report.icon;
        return (
          <Link
            key={slug}
            href={`/reports/${slug}${fixedQuery ?? query}`}
            className="group rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition hover:border-emerald-700"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <Icon className="size-4 text-emerald-400" aria-hidden />
                {report.title}
              </span>
              <span className="font-mono text-lg tabular-nums">{report.metric(rows)}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">{report.description}</p>
          </Link>
        );
      })}
    </div>
  );
}
