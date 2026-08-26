'use client';

import { BarChart2, UserCheck } from 'lucide-react';
import type { StatisticsOverviewData } from '@/lib/actions/statistics';

export function StatisticsOverview({ data }: { data: StatisticsOverviewData }) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-5 bg-white border border-[#E5EBE5] rounded-3xl space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-[#2D6A4F]" />
            <span>Attendance Turnout Per Event</span>
          </h2>
          <div className="space-y-3">
            {data.byEventPct.length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center">No events recorded.</div>
            ) : data.byEventPct.map((event) => (
              <div key={event.label} className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-700">
                  <span className="font-semibold truncate max-w-xs">{event.label}</span>
                  <span className="font-mono text-[#1B4332] font-bold">{event.count} attendees ({event.pct}%)</span>
                </div>
                <div className="w-full bg-[#F8FAF9] rounded-full h-2.5 overflow-hidden border border-[#E5EBE5]">
                  <div className="bg-[#2D6A4F] h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, event.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="p-5 bg-white border border-[#E5EBE5] rounded-3xl space-y-4 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#2D6A4F]" />
            <span>Officer Scan Activity</span>
          </h2>
          <div className="border border-[#E5EBE5] rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAF9] text-slate-600"><tr><th className="py-2.5 px-3.5 font-bold uppercase text-[10px]">Officer Name</th><th className="py-2.5 px-3.5 font-bold uppercase text-[10px] text-right">Scans Logged</th></tr></thead>
              <tbody className="divide-y divide-[#E5EBE5] text-slate-700">
                {Object.keys(data.officerLogs).length === 0 ? (
                  <tr><td colSpan={2} className="py-4 text-center text-slate-400">No officer scan logs.</td></tr>
                ) : Object.entries(data.officerLogs).map(([officer, count]) => (
                  <tr key={officer} className="hover:bg-[#F8FAF9]"><td className="py-2.5 px-3.5 font-semibold text-slate-900">{officer}</td><td className="py-2.5 px-3.5 text-right font-mono font-bold text-[#1B4332]">{count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
