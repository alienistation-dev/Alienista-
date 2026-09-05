'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { buildBadgeData, buildBadgeFilename } from '@/lib/badges/badge';
import type { BadgeStudent } from '@/lib/types/models';

export function BadgeCard({
  student,
  showDownload = true,
  walletSaveUrl = null,
}: {
  student: BadgeStudent;
  showDownload?: boolean;
  walletSaveUrl?: string | null;
}) {
  const badge = useMemo(() => buildBadgeData(student), [student]);
  const [badgeDataUrl, setBadgeDataUrl] = useState('');
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let active = true;
    import('@/lib/badges/render-badge').then(({ renderBadgeToDataUrl }) => renderBadgeToDataUrl(badge))
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

      {(showDownload || walletSaveUrl) && (
        <div className="p-3 bg-[#F8FAF9] border-t border-[#E5EBE5] space-y-2">
          {showDownload && (
            <button
              onClick={handleDownload}
              disabled={!badgeDataUrl}
              className="w-full py-2.5 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span>Download Badge PNG</span>
            </button>
          )}

          {walletSaveUrl && (
            <a
              href={walletSaveUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Save to Google Wallet"
              className="w-full py-2.5 bg-black hover:bg-neutral-800 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
              </svg>
              <span>Save to Google Wallet</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
