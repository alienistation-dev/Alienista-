import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  attendanceInsert: vi.fn(),
  attendanceInsertError: null as { code: string; message: string } | null,
  existingAttendance: null as { id: string } | null,
}));

function terminalQuery(result: unknown) {
  const query: Record<string, unknown> = {};
  Object.assign(query, {
    select: () => query,
    eq: () => query,
    is: () => query,
    single: async () => ({ data: result, error: null }),
    maybeSingle: async () => ({ data: mocks.existingAttendance, error: null }),
  });
  return query;
}

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/lib/supabase/admin', () => ({
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-default',
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'students') {
        return terminalQuery({ id: 'student-1', full_name: 'Student One', status: 'Active' });
      }
      if (table === 'events') {
        return terminalQuery({
          id: 'event-1',
          name: 'Assembly',
          status: 'Open',
          slots: [{
            id: 'slot-1',
            opens_at: '2026-08-22T08:00:00.000Z',
            late_cutoff_at: '2026-08-22T08:15:00.000Z',
            closes_at: '2026-08-22T09:00:00.000Z',
            late_penalty_percent: 25,
          }],
        });
      }
      if (table === 'attendance_records') {
        const query = terminalQuery(null);
        Object.assign(query, {
          insert: async (payload: unknown) => {
            mocks.attendanceInsert(payload);
            return { error: mocks.attendanceInsertError };
          },
        });
        return query;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import { recordScanAction } from '@/lib/actions/attendance';

describe('attendance persistence', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockResolvedValue({
      id: 'officer-1',
      organization_id: 'org-1',
      role: 'officer',
      name: 'Officer One',
    });
    mocks.attendanceInsert.mockClear();
    mocks.attendanceInsertError = null;
    mocks.existingAttendance = null;
  });

  it('persists late status, effective scan time, and the applied penalty', async () => {
    const result = await recordScanAction({
      student_uid: 'ST-2026-0001',
      event_id: 'event-1',
      slot_id: 'slot-1',
      timestamp: '2026-08-22T08:20:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(mocks.attendanceInsert).toHaveBeenCalledWith(expect.objectContaining({
      attendance_status: 'late',
      effective_scan_time: '2026-08-22T08:20:00.000Z',
      late_penalty_percent: 25,
    }));
  });

  it('does not insert a duplicate online scan', async () => {
    mocks.existingAttendance = { id: 'attendance-1' };

    const result = await recordScanAction({
      student_uid: 'ST-2026-0001',
      event_id: 'event-1',
      slot_id: 'slot-1',
      timestamp: '2026-08-22T08:10:00.000Z',
    });

    expect(result).toMatchObject({ success: false, code: 'DUPLICATE' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('treats a replayed client id database conflict as an idempotent duplicate', async () => {
    mocks.attendanceInsertError = { code: '23505', message: 'duplicate client id' };

    const result = await recordScanAction({
      student_uid: 'ST-2026-0001',
      event_id: 'event-1',
      slot_id: 'slot-1',
      client_id: 'scan-replayed-1',
      timestamp: '2026-08-22T08:10:00.000Z',
    });

    expect(result).toMatchObject({ success: false, code: 'DUPLICATE' });
  });

  it('uses the original offline timestamp when calculating and persisting attendance', async () => {
    const result = await recordScanAction({
      student_uid: 'ST-2026-0001',
      event_id: 'event-1',
      slot_id: 'slot-1',
      client_id: 'offline-1',
      timestamp: '2026-08-22T08:10:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(mocks.attendanceInsert).toHaveBeenCalledWith(expect.objectContaining({
      recorded_at: '2026-08-22T08:10:00.000Z',
      effective_scan_time: '2026-08-22T08:10:00.000Z',
      attendance_status: 'on_time',
    }));
  });

  it('rejects an invalid offline timestamp without inserting attendance', async () => {
    const result = await recordScanAction({
      student_uid: 'ST-2026-0001',
      event_id: 'event-1',
      timestamp: 'not-a-date',
    });

    expect(result).toMatchObject({ success: false, code: 'INVALID_TIMESTAMP' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('rejects an offline scan after the attendance window closes', async () => {
    const result = await recordScanAction({
      student_uid: 'ST-2026-0001',
      event_id: 'event-1',
      slot_id: 'slot-1',
      timestamp: '2026-08-22T09:00:00.001Z',
    });

    expect(result).toMatchObject({ success: false, code: 'OUTSIDE_WINDOW' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('rejects an offline scan before the attendance window opens', async () => {
    const result = await recordScanAction({
      student_uid: 'ST-2026-0001',
      event_id: 'event-1',
      slot_id: 'slot-1',
      timestamp: '2026-08-22T07:59:59.999Z',
    });

    expect(result).toMatchObject({ success: false, code: 'OUTSIDE_WINDOW' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });
});
