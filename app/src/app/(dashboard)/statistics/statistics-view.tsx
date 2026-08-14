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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-[#E5EBE5] rounded-2xl p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Filter Year Level:</span>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-[#2D6A4F]"
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
            className="px-3.5 py-1.5 bg-[#F8FAF9] border border-[#E5EBE5] hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Report</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 bg-[#2D6A4F] hover:bg-[#1B4332] rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Grid: Event Turnouts & Officer Scans */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Event Turnout Bars */}
        <div className="p-5 bg-white border border-[#E5EBE5] rounded-3xl space-y-4 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-[#2D6A4F]" />
            <span>Attendance Turnout Per Event</span>
          </h3>
          <div className="space-y-3">
            {data.byEventPct.length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center">No events recorded.</div>
            ) : (
              data.byEventPct.map((ev, i) => (
                <div key={i} className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-700">
                    <span className="font-semibold truncate max-w-xs">{ev.label}</span>
                    <span className="font-mono text-[#1B4332] font-bold">{ev.count} attendees ({ev.pct}%)</span>
                  </div>
                  <div className="w-full bg-[#F8FAF9] rounded-full h-2.5 overflow-hidden border border-[#E5EBE5]">
                    <div
                      className="bg-[#2D6A4F] h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, ev.pct)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Officer Scan Attribution Table */}
        <div className="p-5 bg-white border border-[#E5EBE5] rounded-3xl space-y-4 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#2D6A4F]" />
            <span>Officer Scan Activity</span>
          </h3>
          <div className="border border-[#E5EBE5] rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAF9] text-slate-600">
                <tr>
                  <th className="py-2.5 px-3.5 font-bold uppercase text-[10px]">Officer Name</th>
                  <th className="py-2.5 px-3.5 font-bold uppercase text-[10px] text-right">Scans Logged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EBE5] text-slate-700">
                {Object.keys(data.officerLogs).length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-slate-400">
                      No officer scan logs.
                    </td>
                  </tr>
                ) : (
                  Object.entries(data.officerLogs).map(([off, count], i) => (
                    <tr key={i} className="hover:bg-[#F8FAF9]">
                      <td className="py-2.5 px-3.5 font-semibold text-slate-900">{off}</td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-[#1B4332]">{count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Student Attendance Rate Table */}
      <div className="p-5 bg-white border border-[#E5EBE5] rounded-3xl space-y-4 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">Student Attendance Records ({filteredStudents.length})</h3>
        <div className="border border-[#E5EBE5] rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAF9] text-slate-600">
              <tr>
                <th className="py-3 px-4 font-bold uppercase text-[10px] text-[#2D6A4F]">UID</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px]">Full Name</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px]">Year</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] text-right">Events Attended</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] text-right">Attendance Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EBE5] text-slate-700">
              {filteredStudents.map((st) => (
                <tr key={st.uid} className="hover:bg-[#F8FAF9]">
                  <td className="py-2.5 px-4 font-mono font-bold text-[#1B4332]">{st.uid}</td>
                  <td className="py-2.5 px-4 font-bold text-slate-900">{st.name}</td>
                  <td className="py-2.5 px-4 text-slate-500 font-medium">{st.year}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900">{st.count}</td>
                  <td className="py-2.5 px-4 text-right">
                    <span
                      className={`inline-block font-mono font-bold px-2.5 py-0.5 rounded-full text-[10px] ${
                        st.attendance_pct >= 75
                          ? 'bg-[#EBF5EE] text-[#1B4332] border border-[#C2E0CC]'
                          : st.attendance_pct >= 50
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
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
