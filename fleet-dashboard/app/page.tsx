'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FleetMap } from '@/components/FleetMap';
import { FleetStats } from '@/components/FleetStats';
import { RobotTable } from '@/components/RobotTable';
import { session } from '@/lib/api';
import { useFleet } from '@/lib/fleet-store';

export default function DashboardPage() {
  const router = useRouter();
  const connect = useFleet((s) => s.connect);
  const connection = useFleet((s) => s.connection);

  useEffect(() => {
    const token = session.get();
    if (!token) {
      router.replace('/login');
      return;
    }
    return connect(token);
  }, [connect, router]);

  useEffect(() => {
    if (connection !== 'unauthorized') return;
    session.clear();
    router.replace('/login');
  }, [connection, router]);

  const logout = () => {
    session.clear();
    router.replace('/login');
  };

  return (
    <main className="flex h-dvh flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Robot Fleet Platform</h1>
        <button type="button" onClick={logout} className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </header>
      <FleetStats />
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <section aria-label="Map" className="min-h-72">
          <FleetMap />
        </section>
        <section aria-label="Robots" className="min-h-72">
          <RobotTable />
        </section>
      </div>
    </main>
  );
}
