'use client';

import { Bot } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { login, session } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      session.set(await login(String(form.get('email')), String(form.get('password'))));
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg bg-zinc-900 p-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Bot className="size-5" aria-hidden />
          Robot Fleet Platform
        </h1>
        <label className="block text-sm">
          Email
          <input name="email" type="email" required autoComplete="username" className="mt-1 w-full rounded-md bg-zinc-800 px-3 py-2" />
        </label>
        <label className="block text-sm">
          Password
          <input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-md bg-zinc-800 px-3 py-2" />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className="w-full rounded-md bg-emerald-500 py-2 font-medium text-zinc-950 disabled:opacity-60">
          {pending ? 'Signing in' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
