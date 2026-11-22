import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryError = { code: string; message: string } | null;

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  attendanceInsert: vi.fn(),
  attendanceInsertError: null as { code: string; message: string } | null,
  existingAttendance: null as { id: string } | null,
  student: null as unknown,
  studentError: null as { code: string; message: string } | null,
  event: null as unknown,
  eventError: null as { code: string; message: string } | null,
  officer: null as unknown,
  officerError: null as { code: string; message: string } | null,
  officerFilters: [] as Array<[string, unknown]>,
}));

function terminalQuery(result: () => unknown, error: () => QueryError = () => null, filters?: Array<[string, unknown]>) {
  const query: Record<string, unknown> = {};
  Object.assign(query, {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters?.push([column, value]);
      return query;
    },
    is: () => query,
    single: async () => ({ data: result(), error: error() }),
    maybeSingle: async () => ({ data: result(), error: error() }),
  });
  return query;
}

const openEvent = {
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
};

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/lib/supabase/admin', () => ({
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-default',
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'students') return terminalQuery(() => mocks.student, () => mocks.studentError);
      if (table === 'events') return terminalQuery(() => mocks.event, () => mocks.eventError);
      if (table === 'officers') {
        return terminalQuery(() => mocks.officer, () => mocks.officerError, mocks.officerFilters);
      }
      if (table === 'attendance_records') {
        const query = terminalQuery(() => mocks.existingAttendance);
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

import { bulkSyncScansAction, recordScanAction } from '@/lib/actions/attendance';

const CAPTURING_OFFICER_ID = '7d3f0c2a-5b1e-4c9a-9f3e-2a6b8c4d1e0f';

async function replay(overrides: Record<string, unknown> = {}) {
  const response = await bulkSyncScansAction([{
    client_id: 'offline-1',
    student_uid: 'ST-2026-0001',
    event_id: 'event-1',
    slot_id: 'slot-1',
    timestamp: '2026-08-22T08:10:00.000Z',
    ...overrides,
  }]);
  if (!response.success) throw new Error(response.error);
  return response.data[0];
}

describe('attendance persistence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    // Server clock sits inside slot-1 (on time) unless a test moves it.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-22T08:10:00.000Z'));
    mocks.getSessionUser.mockResolvedValue({
      id: 'officer-1',
      organization_id: 'org-1',
      role: 'officer',
      name: 'Officer One',
    });
    mocks.attendanceInsert.mockClear();
    mocks.attendanceInsertError = null;
    mocks.existingAttendance = null;
    mocks.student = { id: 'student-1', full_name: 'Student One', status: 'Active' };
    mocks.studentError = null;
    mocks.event = openEvent;
    mocks.eventError = null;
    mocks.officer = null;
    mocks.officerError = null;
    mocks.officerFilters = [];
  });

  it('reports a student lookup database error as a retryable server error', async () => {
    mocks.student = null;
    mocks.studentError = { code: '57014', message: 'canceling statement due to statement timeout' };

    const result = await recordScanAction({ student_uid: 'ST-2026-0001', event_id: 'event-1' });

    expect(result).toMatchObject({ success: false, code: 'SERVER_ERROR' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('reports an event lookup database error as a retryable server error', async () => {
    mocks.event = null;
    mocks.eventError = { code: '08006', message: 'connection failure' };

    const result = await recordScanAction({ student_uid: 'ST-2026-0001', event_id: 'event-1' });

    expect(result).toMatchObject({ success: false, code: 'SERVER_ERROR' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('still reports a genuinely missing student as not found', async () => {
    mocks.student = null;

    const result = await recordScanAction({ student_uid: 'ST-UNKNOWN', event_id: 'event-1' });

    expect(result).toMatchObject({ success: false, code: 'STUDENT_NOT_FOUND' });
  });

  it('persists late status, effective scan time, and the applied penalty', async () => {
    vi.setSystemTime(new Date('2026-08-22T08:20:00.000Z'));

    const result = await recordScanAction({
      student_uid: 'ST-2026-0001',
      event_id: 'event-1',
      slot_id: 'slot-1',
    });

    expect(result.success).toBe(true);
    expect(mocks.attendanceInsert).toHaveBeenCalledWith(expect.objectContaining({
      attendance_status: 'late',
      effective_scan_time: '2026-08-22T08:20:00.000Z',
      late_penalty_percent: 25,
    }));
  });

  it('times a live scan with the server clock, not the client timestamp', async () => {
    vi.setSystemTime(new Date('2026-08-22T08:20:00.000Z'));

    const result = await recordScanAction({
      student_uid: 'ST-2026-0001',
      event_id: 'event-1',
      slot_id: 'slot-1',
      timestamp: '2026-08-22T08:05:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(mocks.attendanceInsert).toHaveBeenCalledWith(expect.objectContaining({
      recorded_at: '2026-08-22T08:20:00.000Z',
      attendance_status: 'late',
    }));
  });

  it('does not insert a duplicate online scan', async () => {
    mocks.existingAttendance = { id: 'attendance-1' };

    const result = await recordScanAction({
      student_uid: 'ST-2026-0001',
      event_id: 'event-1',
      slot_id: 'slot-1',
    });

    expect(result).toMatchObject({ success: false, code: 'DUPLICATE' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('treats a replayed client id database conflict as an idempotent duplicate', async () => {
    mocks.attendanceInsertError = { code: '23505', message: 'duplicate client id' };

    const result = await replay({ client_id: 'scan-replayed-1' });

    expect(result).toMatchObject({ success: false, code: 'DUPLICATE' });
  });

  it('uses the original offline timestamp when calculating and persisting attendance', async () => {
    vi.setSystemTime(new Date('2026-08-22T09:30:00.000Z'));

    const result = await replay();

    expect(result.success).toBe(true);
    expect(mocks.attendanceInsert).toHaveBeenCalledWith(expect.objectContaining({
      recorded_at: '2026-08-22T08:10:00.000Z',
      effective_scan_time: '2026-08-22T08:10:00.000Z',
      attendance_status: 'on_time',
    }));
  });

  it('rejects an invalid offline timestamp without inserting attendance', async () => {
    const result = await replay({ slot_id: undefined, timestamp: 'not-a-date' });

    expect(result).toMatchObject({ success: false, code: 'INVALID_TIMESTAMP' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('rejects an offline scan after the attendance window closes', async () => {
    vi.setSystemTime(new Date('2026-08-22T09:30:00.000Z'));

    const result = await replay({ timestamp: '2026-08-22T09:00:00.001Z' });

    expect(result).toMatchObject({ success: false, code: 'OUTSIDE_WINDOW' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('rejects an offline scan before the attendance window opens', async () => {
    const result = await replay({ timestamp: '2026-08-22T07:59:59.999Z' });

    expect(result).toMatchObject({ success: false, code: 'OUTSIDE_WINDOW' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('accepts a delayed replay captured inside the window after the event was closed', async () => {
    vi.setSystemTime(new Date('2026-08-23T10:00:00.000Z'));
    mocks.event = { ...openEvent, status: 'Closed' };

    const result = await replay();

    expect(result.success).toBe(true);
    expect(mocks.attendanceInsert).toHaveBeenCalledWith(expect.objectContaining({
      recorded_at: '2026-08-22T08:10:00.000Z',
      attendance_status: 'on_time',
    }));
  });

  it('still rejects a live scan for a closed event', async () => {
    mocks.event = { ...openEvent, status: 'Closed' };

    const result = await recordScanAction({ student_uid: 'ST-2026-0001', event_id: 'event-1', slot_id: 'slot-1' });

    expect(result).toMatchObject({ success: false, code: 'EVENT_CLOSED' });
  });

  it('still rejects a replay for a closed event that has no slot window', async () => {
    mocks.event = { ...openEvent, status: 'Closed', slots: [] };

    const result = await replay({ slot_id: undefined });

    expect(result).toMatchObject({ success: false, code: 'EVENT_CLOSED' });
  });

  it('rejects a replay captured more than two minutes in the future', async () => {
    const result = await replay({ timestamp: '2026-08-22T08:12:00.001Z' });

    expect(result).toMatchObject({ success: false, code: 'INVALID_TIMESTAMP' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('allows a replay within two minutes of clock skew', async () => {
    const result = await replay({ timestamp: '2026-08-22T08:11:30.000Z' });

    expect(result.success).toBe(true);
  });

  it('rejects a replay captured more than seven days ago', async () => {
    vi.setSystemTime(new Date('2026-08-29T08:10:00.001Z'));
    mocks.event = { ...openEvent, status: 'Closed' };

    const result = await replay();

    expect(result).toMatchObject({ success: false, code: 'INVALID_TIMESTAMP' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('attributes a replay to the capturing officer when they are active in the same organization', async () => {
    mocks.officer = { id: CAPTURING_OFFICER_ID, name: 'Officer Two' };

    const result = await replay({ officer_id: CAPTURING_OFFICER_ID, officer_name: 'Forged Name' });

    expect(result.success).toBe(true);
    expect(mocks.officerFilters).toEqual(expect.arrayContaining([
      ['id', CAPTURING_OFFICER_ID],
      ['organization_id', 'org-1'],
      ['status', 'Active'],
    ]));
    expect(mocks.attendanceInsert).toHaveBeenCalledWith(expect.objectContaining({
      officer_id: CAPTURING_OFFICER_ID,
      officer_name: 'Officer Two',
    }));
  });

  it('falls back to the syncing officer when the queued officer is not an active officer in the organization', async () => {
    mocks.officer = null;

    const result = await replay({ officer_id: CAPTURING_OFFICER_ID });

    expect(result.success).toBe(true);
    expect(mocks.attendanceInsert).toHaveBeenCalledWith(expect.objectContaining({
      officer_id: 'officer-1',
      officer_name: 'Officer One',
    }));
  });

  it('falls back to the syncing officer without a lookup when the queued officer id is malformed', async () => {
    const result = await replay({ officer_id: 'not-a-uuid' });

    expect(result.success).toBe(true);
    expect(mocks.officerFilters).toEqual([]);
    expect(mocks.attendanceInsert).toHaveBeenCalledWith(expect.objectContaining({ officer_id: 'officer-1' }));
  });

  it('keeps a replay queued when the capturing officer lookup fails', async () => {
    mocks.officerError = { code: '08006', message: 'connection failure' };

    const result = await replay({ officer_id: CAPTURING_OFFICER_ID });

    expect(result).toMatchObject({ success: false, code: 'SERVER_ERROR' });
    expect(mocks.attendanceInsert).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied officer id on a live scan', async () => {
    mocks.officer = { id: CAPTURING_OFFICER_ID, name: 'Officer Two' };
    const liveInput = { student_uid: 'ST-2026-0001', event_id: 'event-1', slot_id: 'slot-1', officer_id: CAPTURING_OFFICER_ID };

    const result = await recordScanAction(liveInput);

    expect(result.success).toBe(true);
    expect(mocks.attendanceInsert).toHaveBeenCalledWith(expect.objectContaining({
      officer_id: 'officer-1',
      officer_name: 'Officer One',
    }));
  });
});
