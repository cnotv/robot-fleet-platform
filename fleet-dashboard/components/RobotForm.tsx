'use client';

import { useState, type FormEvent } from 'react';
import { ROBOT_KINDS, type RobotInfo, type RobotInput } from '@/lib/api';
import { useFleet } from '@/lib/fleet-store';
import { KIND_LABELS } from '@/lib/fleet-view';

const input = 'mt-1 w-full rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-100 disabled:opacity-60';

/** Create form when `robot` is absent, edit form otherwise. The id is fixed once created. */
export function RobotForm({ robot, onSaved, onCancel }: { robot?: RobotInfo; onSaved(robot: RobotInfo): void; onCancel(): void }) {
  const sites = useFleet((s) => s.sites);
  const createRobot = useFleet((s) => s.createRobot);
  const updateRobot = useFleet((s) => s.updateRobot);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();
    const values = {
      kind: text('kind') as RobotInput['kind'],
      siteId: text('siteId'),
      model: text('model'),
      serialNumber: text('serialNumber'),
      firmware: text('firmware'),
      maxSpeedMps: Number(text('maxSpeedMps')),
      batteryWh: Number(text('batteryWh')),
    };
    setPending(true);
    setError(null);
    try {
      onSaved(robot ? await updateRobot(robot.id, values) : await createRobot({ id: text('id'), ...values }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setPending(false);
    }
  };

  const sortedSites = Object.values(sites).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg bg-zinc-900 p-4 sm:grid-cols-2">
      <label className="text-sm">
        Robot id
        <input name="id" defaultValue={robot?.id} disabled={!!robot} required pattern="[a-z0-9][a-z0-9\-]{0,63}" placeholder="muc-dlv-99" className={`${input} font-mono`} />
      </label>
      <label className="text-sm">
        Type
        <select name="kind" defaultValue={robot?.kind ?? 'delivery'} className={input}>
          {ROBOT_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Hotel
        <select name="siteId" defaultValue={robot?.siteId ?? sortedSites[0]?.id} className={input}>
          {sortedSites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Model
        <input name="model" defaultValue={robot?.model} required maxLength={64} placeholder="Courier D2" className={input} />
      </label>
      <label className="text-sm">
        Serial number
        <input name="serialNumber" defaultValue={robot?.serialNumber} required maxLength={64} className={`${input} font-mono`} />
      </label>
      <label className="text-sm">
        Firmware
        <input name="firmware" defaultValue={robot?.firmware ?? '5.0.0'} required maxLength={32} className={`${input} font-mono`} />
      </label>
      <label className="text-sm">
        Max speed (m/s)
        <input name="maxSpeedMps" type="number" step="0.1" min="0.1" max="50" defaultValue={robot?.maxSpeedMps ?? 1.2} required className={input} />
      </label>
      <label className="text-sm">
        Battery capacity (Wh)
        <input name="batteryWh" type="number" step="1" min="1" max="100000" defaultValue={robot?.batteryWh ?? 900} required className={input} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-400 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60">
          {pending ? 'Saving' : robot ? 'Save changes' : 'Create robot'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
