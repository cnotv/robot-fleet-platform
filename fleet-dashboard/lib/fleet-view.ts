import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { RobotInfo, RobotKind, RobotState, RobotStatus, Site } from './api';
import { useFleet } from './fleet-store';

/** A robot is offline when it has no live state yet, for example right after it was created. */
export type DisplayStatus = RobotStatus | 'offline';

export const STATUS_COLORS: Record<DisplayStatus, string> = {
  active: '#34d399',
  charging: '#60a5fa',
  error: '#f87171',
  idle: '#a1a1aa',
  offline: '#52525b',
};

export const REGION_LABELS: Record<string, string> = {
  europe: 'Europe',
  north_america: 'North America',
  latin_america: 'Latin America',
  middle_east_africa: 'Middle East and Africa',
  asia_pacific: 'Asia Pacific',
};

export const KIND_LABELS: Record<RobotKind, string> = {
  cleaning: 'Cleaning',
  delivery: 'Delivery',
  room_service: 'Room service',
  reception: 'Reception',
};

export const LOW_BATTERY_PCT = 20;

export interface FleetRow {
  info: RobotInfo;
  site: Site | undefined;
  state: RobotState | undefined;
  status: DisplayStatus;
}

export const FILTER_KEYS = ['region', 'country', 'site', 'kind', 'status'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Partial<Record<FilterKey, string>>;

/** Filters live in the URL so every view can be linked and shared. */
export function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(() => {
    const out: Filters = {};
    for (const key of FILTER_KEYS) {
      const v = params.get(key);
      if (v) out[key] = v;
    }
    return out;
  }, [params]);

  const setFilters = useCallback(
    (patch: Filters) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  /** The current query string, for links that should keep the filters. */
  const query = params.toString() ? `?${params.toString()}` : '';
  return { filters, setFilters, query };
}

export function matches(row: FleetRow, f: Filters): boolean {
  return (
    (!f.region || row.site?.region === f.region) &&
    (!f.country || row.site?.country === f.country) &&
    (!f.site || row.info.siteId === f.site) &&
    (!f.kind || row.info.kind === f.kind) &&
    (!f.status || row.status === f.status)
  );
}

const NO_FILTERS: Filters = {};

/** Inventory joined with live state and sites, then filtered. Recomputed at most every flush. */
export function useFleetRows(filters: Filters = NO_FILTERS): FleetRow[] {
  const inventory = useFleet((s) => s.inventory);
  const sites = useFleet((s) => s.sites);
  const robots = useFleet((s) => s.robots);
  return useMemo(() => {
    const rows: FleetRow[] = [];
    for (const info of Object.values(inventory)) {
      const state = robots[info.id];
      const row: FleetRow = { info, site: sites[info.siteId], state, status: state?.status ?? 'offline' };
      if (matches(row, filters)) rows.push(row);
    }
    return rows.sort((a, b) => a.info.id.localeCompare(b.info.id));
  }, [inventory, sites, robots, filters]);
}

export function countByStatus(rows: FleetRow[]): Record<DisplayStatus, number> {
  const counts: Record<DisplayStatus, number> = { active: 0, charging: 0, error: 0, idle: 0, offline: 0 };
  for (const r of rows) counts[r.status] += 1;
  return counts;
}

/** Share of robots that are online and not faulted. */
export function availability(rows: FleetRow[]): number {
  if (rows.length === 0) return 0;
  const c = countByStatus(rows);
  return (rows.length - c.error - c.offline) / rows.length;
}

export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
