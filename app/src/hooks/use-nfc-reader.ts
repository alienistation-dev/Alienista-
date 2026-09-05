'use client';

import { useState, useEffect, useCallback } from 'react';

export interface NdefRecordLike {
  recordType: string;
  data?: ArrayBuffer | DataView;
}

export function parseNfcRecordPayload(record: NdefRecordLike): string | null {
  try {
    if (!record.data) return null;
    const decoder = new TextDecoder();
    const raw = decoder.decode(record.data).trim();

    if (raw.includes('uid=')) {
      try {
        const url = new URL(raw);
        return url.searchParams.get('uid') || raw;
      } catch {
        const match = raw.match(/uid=([^&]+)/);
        if (match) return match[1];
      }
    }
    return raw;
  } catch {
    return null;
  }
}

export function useNfcReader({
  onScan,
  enabled = true,
}: {
  onScan: (uid: string) => void;
  enabled?: boolean;
}) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsSupported(typeof window !== 'undefined' && 'NDEFReader' in window);
  }, []);

  const startScan = useCallback(async () => {
    if (!isSupported || !enabled) return;
    try {
      // @ts-expect-error Web NFC API type declaration
      const ndef = new window.NDEFReader();
      await ndef.scan();
      setIsListening(true);
      setError(null);

      // @ts-expect-error Web NFC reading event
      ndef.onreading = (event: { message: { records: NdefRecordLike[] } }) => {
        for (const record of event.message.records) {
          const uid = parseNfcRecordPayload(record);
          if (uid) {
            onScan(uid);
            break;
          }
        }
      };

      // @ts-expect-error Web NFC reading error event
      ndef.onreadingerror = () => {
        setError('NFC read error. Please tap again.');
      };
    } catch (err: unknown) {
      setIsListening(false);
      setError((err as Error)?.message || 'Failed to start NFC reader.');
    }
  }, [isSupported, enabled, onScan]);

  return { isSupported, isListening, error, startScan };
}
