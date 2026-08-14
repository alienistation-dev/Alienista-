'use client';

import React, { useState } from 'react';
import { Student } from '@/lib/types/models';
import { BadgeCard } from '@/components/badges/badge-card';
import { Search, Printer } from 'lucide-react';

export function QrGeneratorView({ students }: { students: Student[] }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 8;

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.full_name.toLowerCase().includes(q) ||
      s.uid.toLowerCase().includes(q) ||
      s.student_number.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-[#E5EBE5] rounded-2xl p-4 shadow-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search student to generate badge..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F]"
          />
        </div>

        <button
          onClick={() => window.print()}
          className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs self-end sm:self-auto"
        >
          <Printer className="w-4 h-4" />
          <span>Print Badges</span>
        </button>
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {paginated.length === 0 ? (
          <div className="col-span-full p-12 text-center text-xs text-slate-400 bg-white border border-[#E5EBE5] rounded-2xl">
            No students found matching your search.
          </div>
        ) : (
          paginated.map((st) => <BadgeCard key={st.id} student={st} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-500 font-medium">
          <span>Page {page} of {totalPages} ({filtered.length} total)</span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#E5EBE5] hover:border-slate-300 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#E5EBE5] hover:border-slate-300 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
