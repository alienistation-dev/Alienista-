'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import { Camera, AlertCircle } from 'lucide-react';

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  facingMode?: 'environment' | 'user';
  active: boolean;
}

export function QrScannerComponent({ onScan, facingMode = 'environment', active }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const containerId = 'html5-qr-reader-container';
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastScanRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);

  // Keep onScan ref always up to date without triggering useEffect re-runs
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Stable scan handler that deduplicates rapid re-scans of the same code
  const handleDecodedText = useCallback((decodedText: string) => {
    const now = Date.now();
    // Ignore duplicate scans of the same code within 3 seconds
    if (decodedText === lastScanRef.current && now - lastScanTimeRef.current < 3000) {
      return;
    }
    lastScanRef.current = decodedText;
    lastScanTimeRef.current = now;
    onScanRef.current(decodedText);
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!active) {
      if (scannerRef.current) {
        const state = scannerRef.current.getState();
        if (state === 2 || state === 3) {
          scannerRef.current.stop().catch(() => {});
        }
        try { scannerRef.current.clear(); } catch {}
        scannerRef.current = null;
      }
      queueMicrotask(() => setErrorMessage(null));
      return;
    }

    queueMicrotask(() => setErrorMessage(null));

    // Small delay to ensure DOM container is ready after React render
    const initTimeout = setTimeout(async () => {
      if (!isMounted) return;

      // Clean up any existing scanner before creating a new one
      if (scannerRef.current) {
        try {
          const state = scannerRef.current.getState();
          if (state === 2 || state === 3) {
            await scannerRef.current.stop();
          }
          try { scannerRef.current.clear(); } catch {}
        } catch {}
        scannerRef.current = null;
      }

      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = scanner;

      const scanConfig = {
        fps: 10,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          // Use 70% of the smaller dimension for the scan region
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(minDim * 0.7);
          return { width: Math.max(size, 150), height: Math.max(size, 150) };
        },
        aspectRatio: 1.0,
        disableFlip: false,
      };

      const successCallback = (decodedText: string) => {
        if (isMounted) handleDecodedText(decodedText);
      };
      const errorCallback = () => {
        // Ignore per-frame decode failures — these are normal when no QR is in view
      };

      try {
        // Try to enumerate cameras first
        const cameras = await Html5Qrcode.getCameras().catch(() => []);

        if (!isMounted) return;

        if (cameras && cameras.length > 0) {
          // Pick the best camera based on facingMode preference
          let selectedCamera = cameras[0];
          if (facingMode === 'environment') {
            const backCam = cameras.find(
              (c) => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear') || c.label.toLowerCase().includes('environment')
            );
            if (backCam) selectedCamera = backCam;
          } else {
            const frontCam = cameras.find(
              (c) => c.label.toLowerCase().includes('front') || c.label.toLowerCase().includes('user') || c.label.toLowerCase().includes('selfie')
            );
            if (frontCam) selectedCamera = frontCam;
          }

          await scanner.start(
            { deviceId: { exact: selectedCamera.id } },
            scanConfig,
            successCallback,
            errorCallback
          );
        } else {
          // No cameras enumerated — use facingMode constraint directly
          await scanner.start(
            { facingMode },
            scanConfig,
            successCallback,
            errorCallback
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown camera error';
        console.warn('Primary camera start failed, trying facingMode fallback:', message);
        // Fallback: try with just facingMode (no exact constraint)
        try {
          if (!isMounted || !scannerRef.current) return;
          await scanner.start(
            { facingMode },
            scanConfig,
            successCallback,
            errorCallback
          );
        } catch (fallbackErr: unknown) {
          const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown camera error';
          console.warn('Facingmode fallback failed, trying any video input:', fallbackMessage);
          // Last resort: try with just { facingMode: 'user' }
          try {
            if (!isMounted || !scannerRef.current) return;
            await scanner.start(
              { facingMode: 'user' },
              scanConfig,
              successCallback,
              errorCallback
            );
          } catch (lastErr: unknown) {
            if (isMounted) {
              setErrorMessage(lastErr instanceof Error ? lastErr.message : 'Could not access camera. Please allow camera permissions in your browser settings and reload.');
            }
          }
        }
      }
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(initTimeout);
      if (scannerRef.current) {
        const sc = scannerRef.current;
        try {
          const state = sc.getState();
          if (state === 2 || state === 3) {
            sc.stop().then(() => { try { sc.clear(); } catch {} }).catch(() => {});
          } else {
            try { sc.clear(); } catch {}
          }
        } catch {
          try { sc.clear(); } catch {}
        }
        scannerRef.current = null;
      }
    };
  }, [active, facingMode, handleDecodedText]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-black aspect-square max-w-sm mx-auto border border-[#E5EBE5] flex items-center justify-center shadow-inner">
      <div id={containerId} className="w-full h-full" />
      {!active && (
        <div className="absolute inset-0 bg-[#F8FAF9] flex flex-col items-center justify-center text-slate-500 text-xs p-4 text-center">
          <Camera className="w-8 h-8 text-slate-300 mb-2" />
          <span className="font-semibold text-slate-700">Camera is currently stopped.</span>
          <span className="text-[11px] text-slate-500 mt-1">Click &quot;Start Camera&quot; to begin scanning student badges.</span>
        </div>
      )}
      {errorMessage && (
        <div className="absolute inset-0 bg-white/95 p-4 flex flex-col items-center justify-center text-center text-red-600 gap-2">
          <AlertCircle className="w-7 h-7 text-red-500" />
          <p className="text-xs font-bold">Camera Access Error</p>
          <p className="text-[11px] text-slate-600 max-w-xs">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
