'use client';

import React, { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  facingMode?: 'environment' | 'user';
  active: boolean;
}

export function QrScannerComponent({ onScan, facingMode = 'environment', active }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'html5-qr-reader-container';

  useEffect(() => {
    if (!active) {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      return;
    }

    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    const config = {
      fps: 10,
      qrbox: { width: 220, height: 220 },
    };

    scanner
      .start(
        { facingMode },
        config,
        (decodedText) => {
          onScan(decodedText);
        },
        () => {
          // Ignore frame parse errors
        }
      )
      .catch((err) => {
        console.warn('Camera start error:', err);
      });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [active, facingMode, onScan]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-black/90 aspect-square max-w-sm mx-auto border border-slate-800 flex items-center justify-center">
      <div id={containerId} className="w-full h-full" />
      {!active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs p-4 text-center">
          <span>Camera is currently stopped.</span>
          <span className="text-[11px] text-slate-600 mt-1">Click "Start Camera" to begin scanning.</span>
        </div>
      )}
    </div>
  );
}
