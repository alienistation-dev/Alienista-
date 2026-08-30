import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/lib/supabase/admin', () => ({
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-1',
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  deleteAttendanceRecordAction,
  getStudentAttendanceDetailsAction,
  updateAttendanceRecordAction,
} from '@/lib/actions/attendance-admin';

const validInput = {
  record_id: '11111111-1111-4111-8111-111111111111',
  slot_id: '22222222-2222-4222-8222-222222222222',
  effective_scan_time: '2026-08-30T01:00:00.000Z',
  attendance_status: 'late' as const,
  late_penalty_percent: 25,
  earned_points_override: 3.5,
  reason: 'Scanner clock was incorrect.',
};

describe('audited attendance administration', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset().mockResolvedValue({
      id: 'admin-1',
      subject_id: 'admin-1',
      subject_type: 'admin',
      organization_id: 'org-1',
      role: 'admin',
      name: 'Admin',
      issued_at: 1,
      expires_at: 2,
    });
    mocks.rpc.mockReset().mockResolvedValue({ data: { id: validInput.record_id }, error: null });
    mocks.from.mockReset();
  });

  it('rejects non-admin users before calling the correction RPC', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'officer-1', organization_id: 'org-1', role: 'officer' });

    await expect(updateAttendanceRecordAction(validInput)).resolves.toEqual({
      success: false,
      error: 'Only admins can modify attendance records.',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validInput, reason: '   ' }, 'A correction reason is required.'],
    [{ ...validInput, effective_scan_time: 'not-a-date' }, 'Enter a valid effective scan time.'],
    [{ ...validInput, late_penalty_percent: -1 }, 'Late penalty must be between 0 and 100.'],
    [{ ...validInput, late_penalty_percent: 101 }, 'Late penalty must be between 0 and 100.'],
    [{ ...validInput, earned_points_override: -0.01 }, 'Awarded points cannot be negative.'],
  ])('rejects malformed correction input', async (input, error) => {
    await expect(updateAttendanceRecordAction(input)).resolves.toEqual({ success: false, error });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns a validation response for a missing correction payload', async () => {
    await expect(updateAttendanceRecordAction(undefined as never)).resolves.toEqual({
      success: false,
      error: 'Attendance correction input is required.',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('passes the organization scope and normalized correction to the transactional RPC', async () => {
    const result = await updateAttendanceRecordAction({ ...validInput, reason: '  Corrected from paper log.  ' });

    expect(result.success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('update_attendance_record', {
      p_record_id: validInput.record_id,
      p_organization_id: 'org-1',
      p_corrected_by: 'admin-1',
      p_slot_id: validInput.slot_id,
      p_effective_scan_time: validInput.effective_scan_time,
      p_attendance_status: 'late',
      p_late_penalty_percent: 25,
      p_earned_points_override: 3.5,
      p_reason: 'Corrected from paper log.',
    });
  });

  it('propagates cross-organization, slot, and point-limit errors from the RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Attendance record not found in this organization.' } });

    await expect(updateAttendanceRecordAction(validInput)).resolves.toEqual({
      success: false,
      error: 'Attendance record not found in this organization.',
    });
  });

  it('requires a reason and calls the audited delete RPC', async () => {
    await expect(deleteAttendanceRecordAction({ record_id: validInput.record_id, reason: ' ' })).resolves.toEqual({
      success: false,
      error: 'A correction reason is required.',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();

    const result = await deleteAttendanceRecordAction({
      record_id: validInput.record_id,
      reason: 'Duplicate paper entry.',
    });

    expect(result.success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('delete_attendance_record', {
      p_record_id: validInput.record_id,
      p_organization_id: 'org-1',
      p_corrected_by: 'admin-1',
      p_reason: 'Duplicate paper entry.',
    });
  });

  it('returns a validation response for a missing delete payload', async () => {
    await expect(deleteAttendanceRecordAction(undefined as never)).resolves.toEqual({
      success: false,
      error: 'Attendance deletion input is required.',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('loads organization-scoped attendance records and correction history', async () => {
    const responses: Record<string, { data: unknown; error: null }> = {
      students: { data: { id: 'student-1', full_name: 'Test Student' }, error: null },
      attendance_records: { data: [{ id: validInput.record_id, event: { id: 'event-1', name: 'Assembly' } }], error: null },
      attendance_record_corrections: { data: [{ id: 'audit-1', action: 'update', reason: 'Paper log' }], error: null },
    };
    mocks.from.mockImplementation((table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: async () => responses[table],
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(responses[table]).then(resolve),
      };
      return builder;
    });

    const result = await getStudentAttendanceDetailsAction('student-1');

    expect(result).toMatchObject({
      success: true,
      data: {
        student: { id: 'student-1', full_name: 'Test Student' },
        records: [{ id: validInput.record_id }],
        corrections: [{ id: 'audit-1', action: 'update' }],
      },
    });
    expect(mocks.from).toHaveBeenCalledWith('attendance_record_corrections');
  });
});
