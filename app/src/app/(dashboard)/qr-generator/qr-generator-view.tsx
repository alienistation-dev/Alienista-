'use client';

import React, { useState } from 'react';
import { BadgeStudent } from '@/lib/types/models';
import { BadgeCard } from '@/components/badges/badge-card';
import { buildBadgeData } from '@/lib/badges/badge';
import { Search, Printer, LoaderCircle } from 'lucide-react';

export function QrGeneratorView({ students }: { students: BadgeStudent[] }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
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

  const handlePrintAll = async () => {
    if (filtered.length === 0 || isPreparingPrint) return;
    setIsPreparingPrint(true);
    try {
      const { renderBadgeToDataUrl } = await import('@/lib/badges/render-badge');
      const imageUrls = await Promise.all(filtered.map((student) => renderBadgeToDataUrl(buildBadgeData(student))));
      const printWindow = window.open('', '_blank', 'noopener,noreferrer');
      if (!printWindow) throw new Error('The print window was blocked by the browser.');
      printWindow.document.write(`<!doctype html><html><head><title>Alienista badges</title><style>
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; }
        main { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }
        img { width: 100%; height: auto; break-inside: avoid; border: 1px solid #E5EBE5; }
      </style></head><body><main>${imageUrls.map((url, index) => `<img src="${url}" alt="Badge ${index + 1}">`).join('')}</main></body></html>`);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    } finally {
      setIsPreparingPrint(false);
    }
  };

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
          onClick={handlePrintAll}
          disabled={filtered.length === 0 || isPreparingPrint}
          className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs self-end sm:self-auto"
        >
          {isPreparingPrint ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
          <span>{isPreparingPrint ? 'Preparing All Badges' : 'Print / Save PDF'}</span>
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
