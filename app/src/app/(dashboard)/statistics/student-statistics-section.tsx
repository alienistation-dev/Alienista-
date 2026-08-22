'use client';

import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { StudentStatisticsData } from '@/lib/actions/statistics';

export function StudentStatisticsSection({ data }: { data: StudentStatisticsData }) {
  const [yearFilter, setYearFilter] = useState('All');
  const filteredStudents = data.studentsStats.filter((student) => yearFilter === 'All' || student.year === yearFilter);

  const handleExportCsv = () => {
    const headers = ['UID', 'Student Name', 'Year', 'Scans Attended', 'Attendance Rate %'];
    const rows = filteredStudents.map((student) => [`"${student.uid}"`, `"${student.name}"`, `"${student.year}"`, `"${student.count}"`, `"${student.attendance_pct}%"`]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `attendance_statistics_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <section className="p-5 bg-white border border-[#E5EBE5] rounded-3xl space-y-4 shadow-xs">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900">Student Attendance Records ({filteredStudents.length})</h2>
        <div className="flex items-center gap-2">
          <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} aria-label="Filter by year level" className="bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-[#2D6A4F]">
            <option value="All">All Years</option><option value="1st Year">1st Year</option><option value="2nd Year">2nd Year</option><option value="3rd Year">3rd Year</option><option value="4th Year">4th Year</option><option value="Alumni">Alumni</option>
          </select>
          <button onClick={() => window.print()} className="px-3.5 py-1.5 bg-[#F8FAF9] border border-[#E5EBE5] hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"><Printer className="w-3.5 h-3.5 text-slate-500" /><span>Print Report</span></button>
          <button onClick={handleExportCsv} className="px-3.5 py-1.5 bg-[#2D6A4F] hover:bg-[#1B4332] rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-colors shadow-xs"><Download className="w-3.5 h-3.5" /><span>Export CSV</span></button>
        </div>
      </div>
      <div className="border border-[#E5EBE5] rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-[#F8FAF9] text-slate-600"><tr><th className="py-3 px-4 font-bold uppercase text-[10px] text-[#2D6A4F]">UID</th><th className="py-3 px-4 font-bold uppercase text-[10px]">Full Name</th><th className="py-3 px-4 font-bold uppercase text-[10px]">Year</th><th className="py-3 px-4 font-bold uppercase text-[10px] text-right">Events Attended</th><th className="py-3 px-4 font-bold uppercase text-[10px] text-right">Attendance Rate</th></tr></thead>
          <tbody className="divide-y divide-[#E5EBE5] text-slate-700">
            {filteredStudents.map((student) => (
              <tr key={student.uid} className="hover:bg-[#F8FAF9]"><td className="py-2.5 px-4 font-mono font-bold text-[#1B4332]">{student.uid}</td><td className="py-2.5 px-4 font-bold text-slate-900">{student.name}</td><td className="py-2.5 px-4 text-slate-500 font-medium">{student.year}</td><td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900">{student.count}</td><td className="py-2.5 px-4 text-right"><span className={`inline-block font-mono font-bold px-2.5 py-0.5 rounded-full text-[10px] ${student.attendance_pct >= 75 ? 'bg-[#EBF5EE] text-[#1B4332] border border-[#C2E0CC]' : student.attendance_pct >= 50 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{student.attendance_pct}%</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
