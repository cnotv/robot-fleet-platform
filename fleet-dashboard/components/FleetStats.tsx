'use client';

import { Activity, AlertTriangle, BatteryCharging, BatteryMedium, PauseCircle, PowerOff, Gauge } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { availability, countByStatus, pct, type DisplayStatus, type FleetRow } from '@/lib/fleet-view';

const STATUS_ICONS: Record<DisplayStatus, LucideIcon> = {
  active: Activity,
  charging: BatteryCharging,
  error: AlertTriangle,
  idle: PauseCircle,
  offline: PowerOff,
};

export function FleetStats({ rows }: { rows: FleetRow[] }) {
  const stats = useMemo(() => {
    const live = rows.filter((r) => r.state);
    const battery = live.reduce((sum, r) => sum + (r.state?.batteryPct ?? 0), 0);
    return {
      counts: countByStatus(rows),
      availability: availability(rows),
      avgBattery: live.length ? battery / live.length : 0,
    };
  }, [rows]);

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      <Stat icon={Gauge} label="Robots" value={rows.length} />
      <Stat icon={Activity} label="Availability" value={pct(stats.availability)} tone="text-emerald-400" />
      {(Object.keys(STATUS_ICONS) as DisplayStatus[]).map((status) => (
        <Stat key={status} icon={STATUS_ICONS[status]} label={status} value={stats.counts[status]} tone={status === 'error' && stats.counts.error > 0 ? 'text-red-400' : undefined} />
      ))}
      <Stat icon={BatteryMedium} label="Avg battery" value={`${stats.avgBattery.toFixed(1)}%`} />
    </dl>
  );
}

function Stat({ icon: Icon, label, value, tone = 'text-zinc-300' }: { icon: LucideIcon; label: string; value: number | string; tone?: string | undefined }) {
  return (
    <div className="rounded-lg bg-zinc-900 p-3">
      <dt className="flex items-center gap-2 text-xs capitalize text-zinc-400">
        <Icon className={`size-4 ${tone}`} aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 font-mono text-2xl tabular-nums">{value}</dd>
    </div>
  );
}
