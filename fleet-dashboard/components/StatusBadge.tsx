import { STATUS_COLORS, type DisplayStatus } from '@/lib/fleet-view';

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span className="inline-flex items-center gap-2 capitalize">
      <span className="size-2 rounded-full" style={{ background: STATUS_COLORS[status] }} aria-hidden />
      {status}
    </span>
  );
}
