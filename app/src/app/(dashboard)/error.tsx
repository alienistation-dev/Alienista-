'use client';

import { useEffect } from 'react';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Dashboard route error:', error); }, [error]);
  return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800"><h2 className="font-bold">This page could not load</h2><p className="mt-1 text-sm">Check your connection, then try again.</p><button type="button" onClick={reset} className="mt-4 rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white">Try again</button></div>;
}
