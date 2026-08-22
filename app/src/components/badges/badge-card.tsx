'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { buildBadgeData, buildBadgeFilename } from '@/lib/badges/badge';
import { renderBadgeToDataUrl } from '@/lib/badges/render-badge';
import type { Student } from '@/lib/types/models';

export function BadgeCard({ student, showDownload = true }: { student: Student; showDownload?: boolean }) {
  const badge = useMemo(() => buildBadgeData(student), [student]);
  const [badgeDataUrl, setBadgeDataUrl] = useState('');
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let active = true;
    renderBadgeToDataUrl(badge)
      .then((url) => {
        if (active) setBadgeDataUrl(url);
      })
      .catch(() => {
        if (active) setRenderError(true);
      });
    return () => {
      active = false;
    };
  }, [badge]);

  const handleDownload = () => {
    if (!badgeDataUrl) return;
    const link = document.createElement('a');
    link.download = buildBadgeFilename(badge);
    link.href = badgeDataUrl;
    link.click();
  };

  return (
    <div className="bg-white border border-[#E5EBE5] rounded-lg overflow-hidden shadow-md max-w-sm mx-auto">
      <div className="aspect-[5/8] bg-[#F8FAF9] flex items-center justify-center">
        {badgeDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={badgeDataUrl} alt={`${badge.full_name} membership badge`} className="w-full h-full object-contain" />
        ) : (
          <div className="text-xs text-slate-500 px-6 text-center">
            {renderError ? 'Badge rendering failed. Reload and try again.' : 'Generating badge...'}
          </div>
        )}
      </div>

      {showDownload && (
        <div className="p-3 bg-[#F8FAF9] border-t border-[#E5EBE5]">
          <button
            onClick={handleDownload}
            disabled={!badgeDataUrl}
            className="w-full py-2.5 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span>Download Badge PNG</span>
          </button>
        </div>
      )}
    </div>
  );
}
