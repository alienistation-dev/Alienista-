'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Download, Printer, Search } from 'lucide-react';
import { getStudentStatisticsAction, type StudentStatisticsData } from '@/lib/actions/statistics';
import { collectAllPages } from '@/lib/collect-pages';
import type { YearLevel } from '@/lib/types/models';

export function StudentStatisticsSection({ data }: { data: StudentStatisticsData }) {
  const [students, setStudents] = useState(data.items);
  const [total, setTotal] = useState(data.total);
  const [yearFilter, setYearFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(data.page);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const initialLoad = useRef(true);
  const totalPages = Math.ceil(total / data.pageSize) || 1;

  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await getStudentStatisticsAction({
          page,
          pageSize: data.pageSize,
          query: search,
          year: yearFilter === 'All' ? undefined : yearFilter as YearLevel,
        });
        if (!result.success) return;
        setStudents(result.data.items);
        setTotal(result.data.total);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [data.pageSize, page, search, yearFilter]);

  const handleExportCsv = () => {
    startTransition(async () => {
      try {
        setError('');
        const exportStudents = await collectAllPages(async (exportPage) => {
          const result = await getStudentStatisticsAction({
            page: exportPage,
            pageSize: 100,
            query: search,
            year: yearFilter === 'All' ? undefined : yearFilter as YearLevel,
          });
          if (!result.success) throw new Error(result.error);
          return result.data;
        });
        const headers = ['UID', 'Student Name', 'Year', 'Scans Attended', 'Attendance Rate %'];
        const rows = exportStudents.map((student) => [`"${student.uid}"`, `"${student.name}"`, `"${student.year}"`, `"${student.count}"`, `"${student.attendance_pct}%"`]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
        const link = document.createElement('a');
        link.href = encodeURI(csvContent);
        link.download = `attendance_statistics_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
      } catch (exportError) {
        setError(exportError instanceof Error ? exportError.message : 'Statistics export failed.');
      }
    });
  };

  return (
    <section className="p-5 bg-white border border-[#E5EBE5] rounded-3xl space-y-4 shadow-xs">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900">Student Attendance Records ({total})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search students" className="w-44 rounded-xl border border-[#E5EBE5] bg-[#F8FAF9] py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#2D6A4F] focus:outline-none" />
          </label>
          <select value={yearFilter} onChange={(event) => { setYearFilter(event.target.value); setPage(1); }} aria-label="Filter by year level" className="bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-[#2D6A4F]">
            <option value="All">All Years</option><option value="1st Year">1st Year</option><option value="2nd Year">2nd Year</option><option value="3rd Year">3rd Year</option><option value="4th Year">4th Year</option><option value="Alumni">Alumni</option>
          </select>
          <button onClick={() => window.print()} className="px-3.5 py-1.5 bg-[#F8FAF9] border border-[#E5EBE5] hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"><Printer className="w-3.5 h-3.5 text-slate-500" /><span>Print Report</span></button>
          <button disabled={isPending} onClick={handleExportCsv} className="px-3.5 py-1.5 bg-[#2D6A4F] hover:bg-[#1B4332] rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"><Download className="w-3.5 h-3.5" /><span>Export CSV</span></button>
        </div>
      </div>
      <div className="border border-[#E5EBE5] rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-[#F8FAF9] text-slate-600"><tr><th className="py-3 px-4 font-bold uppercase text-[10px] text-[#2D6A4F]">UID</th><th className="py-3 px-4 font-bold uppercase text-[10px]">Full Name</th><th className="py-3 px-4 font-bold uppercase text-[10px]">Year</th><th className="py-3 px-4 font-bold uppercase text-[10px] text-right">Events Attended</th><th className="py-3 px-4 font-bold uppercase text-[10px] text-right">Attendance Rate</th></tr></thead>
          <tbody className="divide-y divide-[#E5EBE5] text-slate-700">
            {students.map((student) => (
              <tr key={student.uid} className="hover:bg-[#F8FAF9]"><td className="py-2.5 px-4 font-mono font-bold text-[#1B4332]">{student.uid}</td><td className="py-2.5 px-4 font-bold text-slate-900">{student.name}</td><td className="py-2.5 px-4 text-slate-500 font-medium">{student.year}</td><td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900">{student.count}</td><td className="py-2.5 px-4 text-right"><span className={`inline-block font-mono font-bold px-2.5 py-0.5 rounded-full text-[10px] ${student.attendance_pct >= 75 ? 'bg-[#EBF5EE] text-[#1B4332] border border-[#C2E0CC]' : student.attendance_pct >= 50 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{student.attendance_pct}%</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Page {page} of {totalPages} ({total} total)</span>
          <div className="flex gap-1.5">
            <button disabled={page <= 1 || isPending} onClick={() => setPage((current) => current - 1)} className="rounded-xl border border-[#E5EBE5] bg-white px-3 py-1.5 disabled:opacity-40">Prev</button>
            <button disabled={page >= totalPages || isPending} onClick={() => setPage((current) => current + 1)} className="rounded-xl border border-[#E5EBE5] bg-white px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </section>
  );
}
