'use client';

import type { FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, Popup } from 'maplibre-gl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { STATUS_COLORS, type FleetRow } from '@/lib/fleet-view';

// Free vector tiles, no API key. Swap for Mapbox or a self hosted style in production.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

function toGeoJSON(rows: FleetRow[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: rows.flatMap((r) =>
      r.state
        ? [
            {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [r.state.longitude, r.state.latitude] },
              properties: { id: r.info.id, status: r.status, task: r.state.currentTask, site: r.site?.name ?? r.info.siteId },
            },
          ]
        : [],
    ),
  };
}

/**
 * WebGL map of the fleet. Robots are clustered at world zoom; a cluster turns
 * amber when it contains a faulted robot. Clicking a cluster zooms in,
 * clicking a robot opens its detail page. The camera refits whenever
 * `fitKey` changes (for example when a filter changes), not on live updates.
 */
export function FleetMap({ rows, fitKey, className = 'h-full' }: { rows: FleetRow[]; fitKey: string; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const latest = useRef({ rows, fitKey });
  const fitted = useRef<string | null>(null);
  const router = useRouter();

  const sync = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const { rows, fitKey } = latest.current;
    const data = toGeoJSON(rows);
    (m.getSource('robots') as GeoJSONSource).setData(data);
    if (fitted.current === fitKey || data.features.length === 0) return;
    const first = fitted.current === null;
    fitted.current = fitKey;
    // The container may have been laid out after the map measured it.
    m.resize();
    let [w, s, e, n] = [180, 90, -180, -90];
    for (const f of data.features) {
      const [lon, lat] = f.geometry.coordinates as [number, number];
      [w, s, e, n] = [Math.min(w, lon), Math.min(s, lat), Math.max(e, lon), Math.max(n, lat)];
    }
    m.fitBounds([[w, s], [e, n]], { padding: 48, maxZoom: 16, duration: first ? 0 : 800 });
  };

  useEffect(() => {
    latest.current = { rows, fitKey };
    sync();
  });

  useEffect(() => {
    let cancelled = false;
    let popup: Popup | undefined;
    void import('maplibre-gl').then((maplibre) => {
      if (cancelled || !container.current) return;
      const m = new maplibre.Map({
        container: container.current,
        style: STYLE_URL,
        center: [10, 25],
        zoom: 1.2,
        attributionControl: { compact: true },
      });
      map.current = m;
      m.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      popup = new maplibre.Popup({ closeButton: false, closeOnClick: false, className: 'fleet-popup' });

      m.on('load', () => {
        m.addSource('robots', {
          type: 'geojson',
          data: toGeoJSON(latest.current.rows),
          cluster: true,
          clusterRadius: 45,
          clusterMaxZoom: 15,
          clusterProperties: { errors: ['+', ['case', ['==', ['get', 'status'], 'error'], 1, 0]] },
        });
        m.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'robots',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': ['case', ['>', ['get', 'errors'], 0], '#b45309', '#0f766e'],
            'circle-radius': ['step', ['get', 'point_count'], 14, 25, 18, 60, 24],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#18181b',
          },
        });
        m.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'robots',
          filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 12 },
          paint: { 'text-color': '#fafafa' },
        });
        m.addLayer({
          id: 'robots',
          type: 'circle',
          source: 'robots',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'match', ['get', 'status'],
              'active', STATUS_COLORS.active,
              'charging', STATUS_COLORS.charging,
              'error', STATUS_COLORS.error,
              'idle', STATUS_COLORS.idle,
              STATUS_COLORS.offline,
            ],
            'circle-radius': 6,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#18181b',
          },
        });

        m.on('click', 'clusters', async (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const source = m.getSource('robots') as GeoJSONSource;
          const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id as number);
          m.easeTo({ center: (feature.geometry as Point).coordinates as [number, number], zoom });
        });
        m.on('click', 'robots', (e) => {
          const id = e.features?.[0]?.properties.id as string | undefined;
          if (id) router.push(`/robots/${id}`);
        });
        m.on('mouseenter', 'robots', (e) => {
          const f = e.features?.[0];
          if (!f || !popup) return;
          const p = f.properties as Record<string, string>;
          const el = document.createElement('div');
          el.textContent = `${p.id} · ${p.status} · ${p.task}`;
          popup.setLngLat((f.geometry as Point).coordinates as [number, number]).setDOMContent(el).addTo(m);
        });
        m.on('mouseleave', 'robots', () => popup?.remove());
        for (const layer of ['clusters', 'robots']) {
          m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'));
          m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''));
        }
        ready.current = true;
        sync();
      });
    });

    return () => {
      cancelled = true;
      ready.current = false;
      fitted.current = null;
      popup?.remove();
      map.current?.remove();
      map.current = null;
    };
    // sync only reads refs, so the map is created once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <div
      ref={container}
      className={`${className} w-full overflow-hidden rounded-lg bg-zinc-900`}
      role="region"
      aria-label="Map of robot positions. Use the table for a text list."
    />
  );
}
