'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import { Download, Loader2 } from 'lucide-react';
import { buildBadgeData, buildBadgeFilename } from '@/lib/badges/badge';
import type { BadgeStudent } from '@/lib/types/models';
import { getStudentGoogleWalletUrlAction } from '@/lib/actions/google-wallet';
import { BadgeArtwork } from '@/components/badges/badge-artwork';
import type { BadgeArtworkAssets } from '@/lib/badges/artwork';

// Google's brand rules require their button artwork unmodified: public/add-to-google-wallet.svg is the
// enUS "wallet-button" file from developers.google.com/static/wallet/download-assets/add-to-wallet-svg.zip.
// Shown at 48px high (the minimum) with at least 8px clear space; do not restyle it.
function GoogleWalletButtonArtwork() {
  return (
    <Image src="/add-to-google-wallet.svg" alt="Add to Google Wallet" width={283} height={50} unoptimized className="h-12 w-auto" />
  );
}

export function BadgeCard({
  student,
  showDownload = true,
  walletSaveUrl = null,
  showWalletButton = false,
}: {
  student: BadgeStudent;
  showDownload?: boolean;
  walletSaveUrl?: string | null;
  showWalletButton?: boolean;
}) {
  const badge = useMemo(() => buildBadgeData(student), [student]);
  const [artworkAssets, setArtworkAssets] = useState<BadgeArtworkAssets>({ qrDataUrl: null, avatarDataUrl: null });
  const [renderError, setRenderError] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Show the QR as soon as it is drawn. The preview uses the avatar URL directly; the avatar fetch
  // and PNG export run only when the user downloads.
  useEffect(() => {
    let active = true;
    import('@/lib/badges/render-badge')
      .then(({ buildBadgeArtworkAssets }) => buildBadgeArtworkAssets({ ...badge, avatar_url: null }))
      .then((assets) => {
        if (active) setArtworkAssets({ qrDataUrl: assets.qrDataUrl, avatarDataUrl: badge.avatar_url });
      })
      .catch(() => {
        if (active) setRenderError(true);
      });
    return () => {
      active = false;
    };
  }, [badge]);

  const handleDownload = async () => {
    setErrorMessage(null);
    setIsExporting(true);
    try {
      const { renderBadgeToDataUrl } = await import('@/lib/badges/render-badge');
      const link = document.createElement('a');
      link.download = buildBadgeFilename(badge);
      link.href = await renderBadgeToDataUrl(badge);
      link.click();
    } catch {
      setErrorMessage('Badge PNG export failed. Reload and try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDynamicWalletClick = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await getStudentGoogleWalletUrlAction(student.id);
        if (res.success) {
          if (res.data?.url) {
            // Mobile browsers may block a popup opened after an await. 'noopener' would make
            // window.open return null even on success, so detect the block and cut the opener by hand.
            const opened = window.open(res.data.url, '_blank');
            if (opened) opened.opener = null;
            else window.location.assign(res.data.url);
            if (res.message) setErrorMessage(res.message);
          } else {
            setErrorMessage('Google Wallet pass URL was not returned.');
          }
        } else {
          setErrorMessage(res.error || 'Failed to generate Google Wallet pass.');
        }
      } catch {
        setErrorMessage('Unable to generate pass. Please check your network or server configuration.');
      }
    });
  };

  const shouldShowWallet = Boolean(walletSaveUrl || showWalletButton);

  return (
    <div className="bg-white border border-[#E5EBE5] rounded-lg overflow-hidden shadow-md max-w-sm mx-auto">
      <div className="relative aspect-[5/8] bg-[#F8FAF9] flex items-center justify-center">
        <BadgeArtwork badge={badge} assets={artworkAssets} />
        {renderError && <div className="absolute inset-0 flex items-center justify-center bg-white/85 px-6 text-center text-xs text-red-700">Badge rendering failed. Reload and try again.</div>}
      </div>

      {(showDownload || shouldShowWallet) && (
        <div className="p-3 bg-[#F8FAF9] border-t border-[#E5EBE5] space-y-2">
          {showDownload && (
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="w-full py-2.5 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-40 cursor-pointer"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>Download Badge PNG</span>
            </button>
          )}

          {walletSaveUrl ? (
            <div className="flex justify-center p-2">
              <a href={walletSaveUrl} target="_blank" rel="noopener noreferrer" className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1F1F1F]">
                <GoogleWalletButtonArtwork />
              </a>
            </div>
          ) : shouldShowWallet ? (
            <div className="flex flex-col items-center p-2">
              <button
                type="button"
                onClick={handleDynamicWalletClick}
                disabled={isPending}
                aria-busy={isPending}
                className="rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1F1F1F]"
              >
                <GoogleWalletButtonArtwork />
              </button>
              {isPending && (
                <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-[#4B5563]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating your Google Wallet pass...
                </p>
              )}
            </div>
          ) : null}

          {errorMessage && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-center">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
