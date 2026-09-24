'use client';

import { FilterX } from 'lucide-react';
import { useMemo } from 'react';
import { ROBOT_KINDS } from '@/lib/api';
import { useFleet } from '@/lib/fleet-store';
import { KIND_LABELS, REGION_LABELS, STATUS_COLORS, useFilters, type FilterKey } from '@/lib/fleet-view';

type Option = { value: string; label: string };

/** Location and robot filters. Narrower location choices follow the wider ones. */
export function FilterBar({ hide = [] }: { hide?: FilterKey[] }) {
  const { filters, setFilters } = useFilters();
  const sites = useFleet((s) => s.sites);

  const options = useMemo(() => {
    const all = Object.values(sites);
    const inRegion = all.filter((s) => !filters.region || s.region === filters.region);
    const inCountry = inRegion.filter((s) => !filters.country || s.country === filters.country);
    const unique = (values: string[]) => [...new Set(values)].sort();
    return {
      region: unique(all.map((s) => s.region)).map((v) => ({ value: v, label: REGION_LABELS[v] ?? v })),
      country: unique(inRegion.map((s) => s.country)).map((v) => ({ value: v, label: v })),
      site: inCountry.sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: s.id, label: s.name })),
      kind: ROBOT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })),
      status: Object.keys(STATUS_COLORS).map((s) => ({ value: s, label: s })),
    } satisfies Record<FilterKey, Option[]>;
  }, [sites, filters.region, filters.country]);

  const fields: { key: FilterKey; label: string; clears: FilterKey[] }[] = [
    { key: 'region', label: 'Region', clears: ['country', 'site'] },
    { key: 'country', label: 'Country', clears: ['site'] },
    { key: 'site', label: 'Hotel', clears: [] },
    { key: 'kind', label: 'Robot type', clears: [] },
    { key: 'status', label: 'Status', clears: [] },
  ];
  const active = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-zinc-900 p-3" role="group" aria-label="Filters">
      {fields
        .filter((f) => !hide.includes(f.key))
        .map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs text-zinc-400">
            {f.label}
            <select
              value={filters[f.key] ?? ''}
              onChange={(e) => setFilters({ [f.key]: e.target.value, ...Object.fromEntries(f.clears.map((c) => [c, ''])) })}
              className="min-w-36 rounded-md bg-zinc-800 px-2 py-1.5 text-sm capitalize text-zinc-100"
            >
              <option value="">All</option>
              {options[f.key].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      {active && (
        <button
          type="button"
          onClick={() => setFilters(Object.fromEntries(fields.map((f) => [f.key, ''])))}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <FilterX className="size-4" aria-hidden />
          Clear
        </button>
      )}
    </div>
  );
}
