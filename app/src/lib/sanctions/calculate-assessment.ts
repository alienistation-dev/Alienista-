import type { SanctionPolicy, SanctionTier } from '@/lib/types/models';

export interface AssessmentSlotInput {
  id: string;
  label: string;
  is_required: boolean;
}

export interface AssessmentAttendanceInput {
  slot_id: string | null;
  attendance_status: 'on_time' | 'late' | 'manual';
  late_penalty_percent: number;
  earned_points_override?: number | null;
}

export interface AssessmentEventInput {
  id: string;
  name: string;
  weight: number;
  slots: AssessmentSlotInput[];
  attendance: AssessmentAttendanceInput[];
}

export interface AssessmentContribution {
  event_id: string;
  event_name: string;
  maximum_points: number;
  earned_points: number;
  slots: Array<{
    slot_id: string | null;
    label: string;
    maximum_points: number;
    earned_points: number;
    status: 'missed' | 'on_time' | 'late' | 'manual';
    late_penalty_percent: number;
  }>;
}

export interface CalculatedAssessment {
  student_id: string;
  maximum_points: number;
  earned_points: number;
  missed_points: number;
  attendance_ratio: number;
  contributions: AssessmentContribution[];
}

export interface SelectedSanctionTier extends SanctionTier {
  matched_threshold: string;
}

const roundPoints = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateStudentAssessment(
  studentId: string,
  events: AssessmentEventInput[],
  policy: SanctionPolicy
): CalculatedAssessment {
  void policy;
  const contributions = events.map((event) => {
    const requiredSlots = event.slots.filter((slot) => slot.is_required);
    const effectiveSlots = requiredSlots.length > 0 ? requiredSlots : [{ id: null, label: 'Attendance', is_required: true }];
    const slotPoints = event.weight / effectiveSlots.length;
    const slots = effectiveSlots.map((slot) => {
      const attendance = event.attendance.find((record) => record.slot_id === slot.id);
      const penalty = attendance?.attendance_status === 'late' ? attendance.late_penalty_percent : 0;
      const normallyEarned = attendance ? slotPoints * (1 - penalty / 100) : 0;
      const earned = attendance?.earned_points_override ?? normallyEarned;
      return {
        slot_id: slot.id,
        label: slot.label,
        maximum_points: roundPoints(slotPoints),
        earned_points: roundPoints(earned),
        status: attendance?.attendance_status || ('missed' as const),
        late_penalty_percent: penalty,
      };
    });
    return {
      event_id: event.id,
      event_name: event.name,
      maximum_points: roundPoints(event.weight),
      earned_points: roundPoints(slots.reduce((total, slot) => total + slot.earned_points, 0)),
      slots,
    };
  });
  const maximumPoints = roundPoints(contributions.reduce((total, event) => total + event.maximum_points, 0));
  const earnedPoints = roundPoints(contributions.reduce((total, event) => total + event.earned_points, 0));
  return {
    student_id: studentId,
    maximum_points: maximumPoints,
    earned_points: earnedPoints,
    missed_points: roundPoints(Math.max(0, maximumPoints - earnedPoints)),
    attendance_ratio: maximumPoints === 0 ? 1 : roundPoints(earnedPoints / maximumPoints),
    contributions,
  };
}

export function selectSanctionTier(
  missedPoints: number,
  attendanceRatio: number,
  policy: SanctionPolicy
): SelectedSanctionTier | null {
  if (policy.mode === 'weighted_missed_points') {
    const matches = policy.tiers
      .filter((tier) => tier.minimum_missed_points !== undefined && missedPoints >= tier.minimum_missed_points)
      .sort((a, b) => (b.minimum_missed_points || 0) - (a.minimum_missed_points || 0));
    const tier = matches[0];
    return tier ? { ...tier, matched_threshold: `Missed points >= ${tier.minimum_missed_points}` } : null;
  }
  const matches = policy.tiers
    .filter((tier) => tier.maximum_attendance_ratio !== undefined && attendanceRatio <= tier.maximum_attendance_ratio)
    .sort((a, b) => (a.maximum_attendance_ratio || 0) - (b.maximum_attendance_ratio || 0));
  const tier = matches[0];
  return tier ? { ...tier, matched_threshold: `Attendance ratio <= ${Math.round((tier.maximum_attendance_ratio || 0) * 100)}%` } : null;
}

export function finalizeAssessmentSnapshot<T extends { status: 'draft' | 'finalized'; finalized_at: string | null; finalized_by: string | null }>(
  assessment: T,
  adminId: string,
  finalizedAt: string = new Date().toISOString()
): Omit<T, 'status' | 'finalized_at' | 'finalized_by'> & { status: 'finalized'; finalized_at: string; finalized_by: string } {
  if (assessment.status !== 'draft') throw new Error('Only draft assessments can be finalized.');
  return { ...assessment, status: 'finalized', finalized_at: finalizedAt, finalized_by: adminId };
}
