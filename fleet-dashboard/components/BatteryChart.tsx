import type { HistoryPoint } from '@/lib/api';

const W = 600;
const H = 120;

/** Battery level over time as a line, with faults marked. Plain SVG, no chart library. */
export function BatteryChart({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) return <p className="text-sm text-zinc-500">Not enough history yet. Samples arrive every 10 seconds or on each change.</p>;
  const t0 = Date.parse(points[0]!.timestamp);
  const span = Math.max(1, Date.parse(points.at(-1)!.timestamp) - t0);
  const x = (p: HistoryPoint) => ((Date.parse(p.timestamp) - t0) / span) * W;
  const y = (p: HistoryPoint) => H - (p.batteryPct / 100) * H;
  const line = points.map((p) => `${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const last = points.at(-1)!;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full overflow-visible" role="img" aria-label={`Battery from ${points[0]!.batteryPct.toFixed(0)}% to ${last.batteryPct.toFixed(0)}%`}>
        {[25, 50, 75].map((v) => (
          <line key={v} x1={0} x2={W} y1={H - (v / 100) * H} y2={H - (v / 100) * H} stroke="#27272a" strokeDasharray="4 4" />
        ))}
        <polyline points={line} fill="none" stroke="#34d399" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {points
          .filter((p) => p.status === 'error' && p.event !== 'heartbeat')
          .map((p) => (
            <circle key={p.timestamp} cx={x(p)} cy={y(p)} r={4} fill="#f87171" />
          ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-zinc-500">
        <span>{new Date(t0).toLocaleTimeString()}</span>
        <span>Red dots mark faults</span>
        <span>{new Date(last.timestamp).toLocaleTimeString()}</span>
      </figcaption>
    </figure>
  );
}
