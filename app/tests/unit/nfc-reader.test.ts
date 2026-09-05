import { describe, it, expect } from 'vitest';
import { parseNfcRecordPayload } from '@/hooks/use-nfc-reader';

describe('useNfcReader helper', () => {
  it('extracts student UID from plain text NDEF record', () => {
    const record = {
      recordType: 'text',
      data: new TextEncoder().encode('2024-0042'),
    };
    const uid = parseNfcRecordPayload(record);
    expect(uid).toBe('2024-0042');
  });

  it('extracts student UID from URI record containing uid param', () => {
    const record = {
      recordType: 'url',
      data: new TextEncoder().encode('https://alienista.edu/scan?uid=2024-0099'),
    };
    const uid = parseNfcRecordPayload(record);
    expect(uid).toBe('2024-0099');
  });

  it('returns raw decoded text as fallback', () => {
    const record = {
      recordType: 'unknown',
      data: new TextEncoder().encode('2024-0100'),
    };
    const uid = parseNfcRecordPayload(record);
    expect(uid).toBe('2024-0100');
  });
});
