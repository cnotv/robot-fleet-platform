'use client';

import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BatteryChart } from '@/components/BatteryChart';
import { FleetMap } from '@/components/FleetMap';
import { RobotForm } from '@/components/RobotForm';
import { StatusBadge } from '@/components/StatusBadge';
import { api, type HistoryPoint } from '@/lib/api';
import { useFleet } from '@/lib/fleet-store';
import { KIND_LABELS, useFleetRows } from '@/lib/fleet-view';

const HISTORY_REFRESH_MS = 15_000;

export default function RobotPage() {
  const { robotId } = useParams<{ robotId: string }>();
  const router = useRouter();
  const info = useFleet((s) => s.inventory[robotId]);
  const state = useFleet((s) => s.robots[robotId]);
  const site = useFleet((s) => (info ? s.sites[info.siteId] : undefined));
  const token = useFleet((s) => s.token);
  const canWrite = useFleet((s) => s.role !== 'viewer');
  const deleteRobot = useFleet((s) => s.deleteRobot);
  const rows = useFleetRows(useMemo(() => ({ site: info?.siteId }), [info?.siteId])).filter((r) => r.info.id === robotId);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !info) return;
    let cancelled = false;
    const load = () =>
      api
        .history(token, robotId, 60)
        .then((h) => !cancelled && setHistory(h))
        .catch(() => {});
    void load();
    const timer = setInterval(load, HISTORY_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, robotId, info]);

  if (!info) {
    return (
      <p>
        Robot {robotId} is not in the inventory. <Link href="/robots" className="text-emerald-300 hover:underline">Back to robots</Link>
      </p>
    );
  }

  const remove = async () => {
    if (!window.confirm(`Delete ${robotId} from the inventory? Its telemetry history is kept until it expires.`)) return;
    try {
      await deleteRobot(robotId);
      router.push('/robots');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const tasks = history.filter((h) => h.event === 'task_started').reverse().slice(0, 12);
  const specs: [string, string][] = [
    ['Type', KIND_LABELS[info.kind]],
    ['Model', info.model],
    ['Serial number', info.serialNumber],
    ['Firmware', info.firmware],
    ['Max speed', `${info.maxSpeedMps} m/s`],
    ['Battery capacity', `${info.batteryWh} Wh`],
    ['Commissioned', new Date(info.commissionedAt).toLocaleDateString()],
  ];

  return (
    <>
      <Link href={`/sites/${info.siteId}`} className="flex w-fit items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100">
        <ArrowLeft className="size-4" aria-hidden />
        {site?.name ?? info.siteId}
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="font-mono text-xl font-semibold">{robotId}</h1>
        <StatusBadge status={state?.status ?? 'offline'} />
        {canWrite && !editing && (
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700">
              <Pencil className="size-4" aria-hidden />
              Edit
            </button>
            <button type="button" onClick={remove} className="flex items-center gap-2 rounded-md bg-red-950 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900">
              <Trash2 className="size-4" aria-hidden />
              Delete
            </button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {editing && <RobotForm robot={info} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Battery', state ? `${state.batteryPct.toFixed(1)}%` : '·'],
          ['Speed', state ? `${state.speedMps.toFixed(2)} m/s` : '·'],
          ['Current task', state?.currentTask ?? 'no telemetry yet'],
          ['Last report', state ? new Date(state.timestamp).toLocaleTimeString() : '·'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-zinc-900 p-3">
            <dt className="text-xs text-zinc-400">{label}</dt>
            <dd className="mt-1 truncate font-mono text-lg">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 xl:grid-cols-2">
        <section aria-labelledby="battery-heading" className="rounded-lg bg-zinc-900 p-4">
          <h2 id="battery-heading" className="mb-3 font-medium">
            Battery, last hour
          </h2>
          <BatteryChart points={history} />
        </section>
        <section aria-label="Position" className="h-64 xl:h-auto">
          {state ? (
            <FleetMap rows={rows} fitKey={`robot:${robotId}`} />
          ) : (
            <p className="grid h-full place-items-center rounded-lg bg-zinc-900 text-sm text-zinc-500">No position until the robot connects.</p>
          )}
        </section>
        <section aria-labelledby="tasks-heading" className="rounded-lg bg-zinc-900 p-4">
          <h2 id="tasks-heading" className="mb-3 font-medium">
            Recent tasks
          </h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-zinc-500">No tasks recorded in the last hour.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {tasks.map((t) => (
                <li key={t.timestamp} className="flex justify-between gap-4 border-b border-zinc-800 py-1">
                  <span className="font-mono">{t.currentTask}</span>
                  <span className="text-zinc-500">{new Date(t.timestamp).toLocaleTimeString()}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-labelledby="specs-heading" className="rounded-lg bg-zinc-900 p-4">
          <h2 id="specs-heading" className="mb-3 font-medium">
            Inventory record
          </h2>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
            {specs.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-zinc-400">{label}</dt>
                <dd className="font-mono">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
