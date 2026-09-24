import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Robot Fleet Platform',
  description: 'Live robot fleet dashboard',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Read at request time, not build time, so one image serves every environment.
  await connection();
  const apiUrl = process.env.PUBLIC_API_URL ?? '';
  return (
    <html lang="en">
      <body data-api-url={apiUrl} className="min-h-dvh bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
