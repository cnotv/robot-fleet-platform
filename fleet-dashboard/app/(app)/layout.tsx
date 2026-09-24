'use client';

import { Bot, FileBarChart, LayoutDashboard, LogOut, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, type ReactNode } from 'react';
import { session } from '@/lib/api';
import { useFleet } from '@/lib/fleet-store';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/robots', label: 'Robots', icon: Bot },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
];

/** Signed in shell: owns the single fleet connection shared by every page. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const connect = useFleet((s) => s.connect);
  const connection = useFleet((s) => s.connection);
  const loaded = useFleet((s) => s.inventoryLoaded);

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
  const online = connection === 'open';
  const ConnectionIcon = online ? Wifi : WifiOff;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-900 px-4 py-3">
        <Link href="/" className="font-semibold">
          Robot Fleet Platform
        </Link>
        <nav aria-label="Main" className="flex gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const current = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={current ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${current ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'}`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <span className={`ml-auto flex items-center gap-2 text-xs ${online ? 'text-emerald-400' : 'text-amber-400'}`} role="status">
          <ConnectionIcon className="size-4" aria-hidden />
          {online ? 'Live' : connection}
        </span>
        <button type="button" onClick={logout} className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4">
        <Suspense>{loaded ? children : <p className="text-zinc-500">Loading fleet</p>}</Suspense>
      </main>
    </div>
  );
}
