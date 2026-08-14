import React from 'react';
import { getStatisticsAction } from '@/lib/actions/statistics';
import { StatisticsView } from './statistics-view';

export default async function StatisticsPage() {
  const res = await getStatisticsAction();

  if (!res.success) {
    return (
      <div className="p-6 rounded-2xl bg-red-950/40 border border-red-800 text-red-300 text-sm">
        Failed to load statistics: {res.error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Analytics & Reports</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Comprehensive attendance analytics, turnout percentages, and officer scan audit metrics.
        </p>
      </div>

      <StatisticsView data={res.data} />
    </div>
  );
}
