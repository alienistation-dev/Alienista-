import { AttendanceStatus, LatePolicy } from '@/lib/types/models';

interface AttendanceWindow extends LatePolicy {
  opens_at: string;
  closes_at: string;
}

export interface AttendanceEvaluation {
  status: Extract<AttendanceStatus, 'on_time' | 'late'>;
  effective_scan_time: string;
  late_penalty_percent: number;
}

export function evaluateAttendanceStatus(
  scanTime: string | Date,
  slot: AttendanceWindow
): AttendanceEvaluation {
  const effectiveScanTime = new Date(scanTime);
  const opensAt = new Date(slot.opens_at);
  const closesAt = new Date(slot.closes_at);

  if (
    !Number.isFinite(effectiveScanTime.getTime()) ||
    effectiveScanTime < opensAt ||
    effectiveScanTime > closesAt
  ) {
    throw new Error('Outside active attendance window.');
  }

  const isLate = slot.late_cutoff_at
    ? effectiveScanTime > new Date(slot.late_cutoff_at)
    : false;

  return {
    status: isLate ? 'late' : 'on_time',
    effective_scan_time: effectiveScanTime.toISOString(),
    late_penalty_percent: isLate ? slot.late_penalty_percent : 0,
  };
}
