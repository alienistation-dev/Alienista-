import { describe, it, expect } from 'vitest';

describe('3-Layer Deduplication Engine', () => {
  interface AttendanceEntry {
    student_id: string;
    event_id: string;
    slot_id: string | null;
    client_id: string;
  }

  const existingDatabaseRecords: AttendanceEntry[] = [
    {
      student_id: 'student_1',
      event_id: 'event_general_assembly',
      slot_id: 'slot_morning_in',
      client_id: 'scan_client_111',
    },
  ];

  function validateNewScan(
    newScan: AttendanceEntry,
    databaseRecords: AttendanceEntry[]
  ): { status: 'ACCEPT' | 'DUPLICATE' | 'DUPLICATE_CLIENT_ID' } {
    // Layer 1: Client ID check (prevent resubmission of same offline queue item)
    if (databaseRecords.some((r) => r.client_id === newScan.client_id)) {
      return { status: 'DUPLICATE_CLIENT_ID' };
    }

    // Layer 2: Slot-aware composite check (student_id + event_id + slot_id)
    const duplicate = databaseRecords.some(
      (r) =>
        r.student_id === newScan.student_id &&
        r.event_id === newScan.event_id &&
        (r.slot_id === newScan.slot_id || (!r.slot_id && !newScan.slot_id))
    );

    if (duplicate) {
      return { status: 'DUPLICATE' };
    }

    return { status: 'ACCEPT' };
  }

  it('should accept scan for a new student for the same slot', () => {
    const scan = {
      student_id: 'student_2',
      event_id: 'event_general_assembly',
      slot_id: 'slot_morning_in',
      client_id: 'scan_client_222',
    };
    expect(validateNewScan(scan, existingDatabaseRecords).status).toBe('ACCEPT');
  });

  it('should accept scan for the same student in a DIFFERENT slot (e.g. Afternoon Out)', () => {
    const scan = {
      student_id: 'student_1',
      event_id: 'event_general_assembly',
      slot_id: 'slot_afternoon_out',
      client_id: 'scan_client_333',
    };
    expect(validateNewScan(scan, existingDatabaseRecords).status).toBe('ACCEPT');
  });

  it('should reject duplicate scan for same student in SAME slot', () => {
    const duplicateScan = {
      student_id: 'student_1',
      event_id: 'event_general_assembly',
      slot_id: 'slot_morning_in',
      client_id: 'scan_client_444',
    };
    expect(validateNewScan(duplicateScan, existingDatabaseRecords).status).toBe('DUPLICATE');
  });

  it('should reject resubmission with duplicate client_id', () => {
    const resubmittedScan = {
      student_id: 'student_5',
      event_id: 'event_general_assembly',
      slot_id: 'slot_morning_in',
      client_id: 'scan_client_111',
    };
    expect(validateNewScan(resubmittedScan, existingDatabaseRecords).status).toBe('DUPLICATE_CLIENT_ID');
  });
});
