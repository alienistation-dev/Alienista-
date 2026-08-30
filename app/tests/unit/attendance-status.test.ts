import { describe, expect, it } from 'vitest';
import { evaluateAttendanceStatus } from '@/lib/attendance/status';

const slot = {
  opens_at: '2026-08-22T08:00:00.000Z',
  late_cutoff_at: '2026-08-22T08:15:00.000Z',
  closes_at: '2026-08-22T09:00:00.000Z',
  late_penalty_percent: 25,
};

describe('attendance status evaluation', () => {
  it('treats the exact late cutoff as on time', () => {
    expect(evaluateAttendanceStatus('2026-08-22T08:15:00.000Z', slot)).toEqual({
      status: 'on_time',
      effective_scan_time: '2026-08-22T08:15:00.000Z',
      late_penalty_percent: 0,
    });
  });

  it('marks a scan after the cutoff as late and applies the slot penalty', () => {
    expect(evaluateAttendanceStatus('2026-08-22T08:15:00.001Z', slot)).toEqual({
      status: 'late',
      effective_scan_time: '2026-08-22T08:15:00.001Z',
      late_penalty_percent: 25,
    });
  });

  it('rejects scans outside the slot window', () => {
    expect(() => evaluateAttendanceStatus('2026-08-22T09:00:00.001Z', slot)).toThrow(
      'Outside active attendance window.'
    );
  });

  it('accepts a scan exactly when the slot opens', () => {
    expect(evaluateAttendanceStatus('2026-08-22T08:00:00.000Z', slot).status).toBe('on_time');
  });

  it('accepts a scan exactly when the slot closes', () => {
    expect(evaluateAttendanceStatus('2026-08-22T09:00:00.000Z', slot).status).toBe('late');
  });

  it('rejects a scan before the slot opens', () => {
    expect(() => evaluateAttendanceStatus('2026-08-22T07:59:59.999Z', slot)).toThrow(
      'Outside active attendance window.'
    );
  });
});
