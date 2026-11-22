'use client';

import { BarChart2, UserCheck } from 'lucide-react';
import type { StatisticsOverviewData } from '@/lib/actions/statistics';

export function StatisticsOverview({ data }: { data: StatisticsOverviewData }) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-5 bg-white border border-border rounded-3xl space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            <span>Attendance Turnout Per Event</span>
          </h2>
          <div className="space-y-3">
            {data.byEventPct.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No events recorded.</div>
            ) : data.byEventPct.map((event) => (
              <div key={event.label} className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-700">
                  <span className="font-semibold truncate max-w-xs">{event.label}</span>
                  <span className="font-mono text-primary font-bold">{event.count} attendees ({event.pct}%)</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden border border-border">
                  <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, event.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="p-5 bg-white border border-border rounded-3xl space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" />
            <span>Officer Scan Activity</span>
          </h2>
          <div className="border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted text-slate-600"><tr><th className="py-2.5 px-3.5 font-bold uppercase text-xs">Officer Name</th><th className="py-2.5 px-3.5 font-bold uppercase text-xs text-right">Scans Logged</th></tr></thead>
              <tbody className="divide-y divide-border text-slate-700">
                {Object.keys(data.officerLogs).length === 0 ? (
                  <tr><td colSpan={2} className="py-4 text-center text-muted-foreground">No officer scan logs.</td></tr>
                ) : Object.entries(data.officerLogs).map(([officer, count]) => (
                  <tr key={officer} className="hover:bg-muted"><td className="py-2.5 px-3.5 font-semibold text-slate-900">{officer}</td><td className="py-2.5 px-3.5 text-right font-mono font-bold text-primary">{count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
