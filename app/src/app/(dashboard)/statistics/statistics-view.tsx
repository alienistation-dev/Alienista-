'use client';

import React, { useState } from 'react';
import { StatisticsData } from '@/lib/actions/statistics';
import { Printer, Download, BarChart2, UserCheck } from 'lucide-react';

export function StatisticsView({ data }: { data: StatisticsData }) {
  const [yearFilter, setYearFilter] = useState('All');

  const filteredStudents = data.studentsStats.filter(
    (s) => yearFilter === 'All' || s.year === yearFilter
  );

  const handleExportCsv = () => {
    const headers = ['UID', 'Student Name', 'Year', 'Scans Attended', 'Attendance Rate %'];
    const rows = filteredStudents.map((s) => [
      `"${s.uid}"`,
      `"${s.name}"`,
      `"${s.year}"`,
      `"${s.count}"`,
      `"${s.attendance_pct}%"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `attendance_statistics_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#151E33] border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Filter Year Level:</span>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
          >
            <option value="All">All Years</option>
            <option value="1st Year">1st Year</option>
            <option value="2nd Year">2nd Year</option>
            <option value="3rd Year">3rd Year</option>
            <option value="4th Year">4th Year</option>
            <option value="Alumni">Alumni</option>
          </select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-1.5 bg-[#0B1120] border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 rounded-xl text-xs font-semibold text-slate-950 flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Grid: Event Turnouts & Officer Scans */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Event Turnout Bars */}
        <div className="p-5 bg-[#151E33] border border-slate-800 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-amber-400" />
            <span>Attendance Turnout Per Event</span>
          </h3>
          <div className="space-y-3">
            {data.byEventPct.length === 0 ? (
              <div className="text-xs text-slate-500 py-6 text-center">No events recorded.</div>
            ) : (
              data.byEventPct.map((ev, i) => (
                <div key={i} className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span className="font-medium truncate max-w-xs">{ev.label}</span>
                    <span className="font-mono text-amber-400 font-bold">{ev.count} attendees ({ev.pct}%)</span>
                  </div>
                  <div className="w-full bg-[#0B1120] rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, ev.pct)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Officer Scan Attribution Table */}
        <div className="p-5 bg-[#151E33] border border-slate-800 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>Officer Scan Activity</span>
          </h3>
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B1120] text-slate-400">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Officer Name</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Scans Logged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {Object.keys(data.officerLogs).length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-slate-500">
                      No officer scan logs.
                    </td>
                  </tr>
                ) : (
                  Object.entries(data.officerLogs).map(([off, count], i) => (
                    <tr key={i} className="hover:bg-slate-900/40">
                      <td className="py-2.5 px-3 font-medium text-white">{off}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400">{count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Student Attendance Rate Table */}
      <div className="p-5 bg-[#151E33] border border-slate-800 rounded-2xl space-y-4 shadow-xl">
        <h3 className="text-sm font-bold text-white">Student Attendance Records ({filteredStudents.length})</h3>
        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B1120] text-slate-400">
              <tr>
                <th className="py-3 px-4 font-semibold">UID</th>
                <th className="py-3 px-4 font-semibold">Full Name</th>
                <th className="py-3 px-4 font-semibold">Year</th>
                <th className="py-3 px-4 font-semibold text-right">Events Attended</th>
                <th className="py-3 px-4 font-semibold text-right">Attendance Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredStudents.map((st) => (
                <tr key={st.uid} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-4 font-mono font-bold text-amber-400">{st.uid}</td>
                  <td className="py-2.5 px-4 font-medium text-white">{st.name}</td>
                  <td className="py-2.5 px-4 text-slate-400">{st.year}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-slate-200">{st.count}</td>
                  <td className="py-2.5 px-4 text-right">
                    <span
                      className={`inline-block font-mono font-bold px-2 py-0.5 rounded-full text-[10px] ${
                        st.attendance_pct >= 75
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                          : st.attendance_pct >= 50
                          ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                          : 'bg-red-950 text-red-400 border border-red-800/60'
                      }`}
                    >
                      {st.attendance_pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
