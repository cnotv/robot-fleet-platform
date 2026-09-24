'use client';

import { Activity, AlertTriangle, BatteryCharging, BatteryMedium, PauseCircle, Wifi, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { ROBOT_STATUSES, type RobotStatus } from '@/lib/api';
import { useFleet } from '@/lib/fleet-store';

const STATUS_ICONS: Record<RobotStatus, LucideIcon> = {
  active: Activity,
  charging: BatteryCharging,
  error: AlertTriangle,
  idle: PauseCircle,
};

export function FleetStats() {
  const robots = useFleet((s) => s.robots);
  const connection = useFleet((s) => s.connection);

  const stats = useMemo(() => {
    const counts: Record<RobotStatus, number> = { active: 0, charging: 0, error: 0, idle: 0 };
    let battery = 0;
    const list = Object.values(robots);
    for (const r of list) {
      counts[r.status] += 1;
      battery += r.batteryPct;
    }
    return { counts, total: list.length, avgBattery: list.length ? battery / list.length : 0 };
  }, [robots]);

  const online = connection === 'open';
  const ConnectionIcon = online ? Wifi : WifiOff;

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Stat icon={ConnectionIcon} label={`Live (${connection})`} value={stats.total} tone={online ? 'text-emerald-400' : 'text-amber-400'} />
      {ROBOT_STATUSES.map((status) => (
        <Stat key={status} icon={STATUS_ICONS[status]} label={status} value={stats.counts[status]} />
      ))}
      <Stat icon={BatteryMedium} label="Avg battery" value={`${stats.avgBattery.toFixed(1)}%`} />
    </dl>
  );
}

function Stat({ icon: Icon, label, value, tone = 'text-zinc-300' }: { icon: LucideIcon; label: string; value: number | string; tone?: string }) {
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
