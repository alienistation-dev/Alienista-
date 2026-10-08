'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { BadgeStudent } from '@/lib/types/models';
import type { PaginatedResult } from '@/lib/types/actions';
import { BadgeCard } from '@/components/badges/badge-card';
import { getBadgeStudentsAction } from '@/lib/actions/students';
import { collectAllPages } from '@/lib/collect-pages';
import { buildBadgeData } from '@/lib/badges/badge';
import {
  buildBadgePrintDocument,
  buildBadgePrintLoadingDocument,
  openBadgePrintWindow,
} from '@/lib/badges/print-badges';
import { Search, Printer, LoaderCircle } from 'lucide-react';

export function QrGeneratorView({ initialPage }: { initialPage: PaginatedResult<BadgeStudent> }) {
  const [students, setStudents] = useState(initialPage.items);
  const [total, setTotal] = useState(initialPage.total);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(initialPage.page);
  const [isLoading, startLoading] = useTransition();
  const initialLoad = useRef(true);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printProgress, setPrintProgress] = useState(0);
  const [printError, setPrintError] = useState('');
  const perPage = initialPage.pageSize;
  const totalPages = Math.ceil(total / perPage) || 1;

  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      startLoading(async () => {
        const result = await getBadgeStudentsAction({ page, pageSize: perPage, query: search });
        if (!result.success) {
          setPrintError(result.error);
          return;
        }
        setStudents(result.data.items);
        setTotal(result.data.total);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [page, perPage, search]);

  const handlePrintAll = async () => {
    if (total === 0 || isPreparingPrint) return;
    setPrintError('');
    const printWindow = openBadgePrintWindow();
    if (!printWindow) {
      setPrintError('Printing was blocked. Allow pop-ups for this site, then try again.');
      return;
    }

    setIsPreparingPrint(true);
    setPrintProgress(0);
    try {
      printWindow.document.write(buildBadgePrintLoadingDocument());
      printWindow.document.close();

      const allStudents = await collectAllPages(async (printPage) => {
        const result = await getBadgeStudentsAction({ page: printPage, pageSize: 100, query: search });
        if (!result.success) throw new Error(result.error);
        return result.data;
      });
      const { renderBadgeToDataUrl } = await import('@/lib/badges/render-badge');
      const imageUrls: string[] = [];
      for (const [index, student] of allStudents.entries()) {
        imageUrls.push(await renderBadgeToDataUrl(buildBadgeData(student)));
        setPrintProgress(index + 1);
      }

      printWindow.document.open();
      printWindow.document.write(buildBadgePrintDocument(imageUrls));
      printWindow.document.close();
    } catch {
      printWindow.close();
      setPrintError('Badge preparation failed. Close the print tab and try again.');
    } finally {
      setIsPreparingPrint(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-[#E5EBE5] rounded-2xl p-4 shadow-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
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
          disabled={total === 0 || isPreparingPrint || isLoading}
          className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs self-end sm:self-auto"
        >
          {isPreparingPrint ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
          <span>{isPreparingPrint ? 'Preparing All Badges' : 'Print / Save PDF'}</span>
        </button>
      </div>
      {isPreparingPrint && (
        <p className="text-xs text-slate-500" role="status" aria-live="polite">
          Preparing badge {printProgress} of {total}...
        </p>
      )}
      {printError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2" role="alert">
          {printError}
        </p>
      )}

      {/* Badges Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {students.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-[#E5EBE5] bg-white p-12 text-center text-xs text-muted-foreground">
            No students found matching your search.
          </div>
        ) : (
          students.map((st) => <BadgeCard key={st.id} student={st} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-500 font-medium">
          <span>Page {page} of {totalPages} ({total} total)</span>
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
