'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, AlertCircle } from 'lucide-react';

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  facingMode?: 'environment' | 'user';
  active: boolean;
}

export function QrScannerComponent({ onScan, facingMode = 'environment', active }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'html5-qr-reader-container';
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!active) {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      setErrorMessage(null);
      return;
    }

    setErrorMessage(null);
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        // Enumerate cameras if possible or directly start with facingMode
        const cameras = await Html5Qrcode.getCameras().catch(() => []);
        
        let cameraConfig: any = { facingMode: { exact: facingMode } };
        if (cameras && cameras.length > 0) {
          const selectedCam =
            facingMode === 'environment'
              ? cameras.find((c) => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear')) || cameras[0]
              : cameras.find((c) => c.label.toLowerCase().includes('front') || c.label.toLowerCase().includes('user')) || cameras[0];
          cameraConfig = { deviceId: { exact: selectedCam.id } };
        } else {
          cameraConfig = { facingMode };
        }

        if (!isMounted) return;

        await scanner.start(
          cameraConfig,
          {
            fps: 15,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (isMounted) onScan(decodedText);
          },
          () => {
            // Frame parse drop
          }
        );
      } catch (err: any) {
        console.warn('Camera initiation error, attempting fallback:', err);
        // Fallback to simple facingMode
        try {
          if (!isMounted) return;
          await scanner.start(
            { facingMode },
            { fps: 15, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
              if (isMounted) onScan(decodedText);
            },
            () => {}
          );
        } catch (fallbackErr: any) {
          if (isMounted) {
            setErrorMessage(
              fallbackErr?.message || 'Could not access camera. Please allow camera permissions in your browser.'
            );
          }
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [active, facingMode, onScan]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-black aspect-square max-w-sm mx-auto border border-[#E5EBE5] flex items-center justify-center shadow-inner">
      <div id={containerId} className="w-full h-full" />
      {!active && (
        <div className="absolute inset-0 bg-[#F8FAF9] flex flex-col items-center justify-center text-slate-500 text-xs p-4 text-center">
          <Camera className="w-8 h-8 text-slate-300 mb-2" />
          <span className="font-semibold text-slate-700">Camera is currently stopped.</span>
          <span className="text-[11px] text-slate-500 mt-1">Click "Start Camera" to begin scanning student badges.</span>
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
