import { describe, expect, it } from 'vitest';
import {
  calculateStudentAssessment,
  finalizeAssessmentSnapshot,
  selectSanctionTier,
  type AssessmentEventInput,
} from '@/lib/sanctions/calculate-assessment';
import type { SanctionPolicy } from '@/lib/types/models';

const weightedPolicy: SanctionPolicy = {
  id: 'policy-1',
  organization_id: 'org-1',
  name: 'Weighted missed points',
  version: 1,
  mode: 'weighted_missed_points',
  is_active: true,
  tiers: [
    { id: 'tier-1', label: 'Reminder', minimum_missed_points: 1, obligation_text: 'Complete a check-in with an ACS officer.' },
    { id: 'tier-2', label: 'Service', minimum_missed_points: 5, obligation_text: 'Complete an approved ACS service obligation.' },
  ],
};

const events: AssessmentEventInput[] = [
  {
    id: 'event-1',
    name: 'General Assembly',
    weight: 10,
    slots: [
      { id: 'slot-am', label: 'AM In', is_required: true },
      { id: 'slot-pm', label: 'PM Out', is_required: true },
    ],
    attendance: [
      { slot_id: 'slot-am', attendance_status: 'on_time', late_penalty_percent: 0 },
      { slot_id: 'slot-pm', attendance_status: 'late', late_penalty_percent: 40 },
    ],
  },
];

describe('semester assessment calculation', () => {
  it('allocates event points proportionally across required slots', () => {
    const result = calculateStudentAssessment('student-1', events, weightedPolicy);

    expect(result.maximum_points).toBe(10);
    expect(result.earned_points).toBe(8);
    expect(result.missed_points).toBe(2);
    expect(result.attendance_ratio).toBe(0.8);
    expect(result.contributions[0].slots).toEqual([
      expect.objectContaining({ slot_id: 'slot-am', maximum_points: 5, earned_points: 5 }),
      expect.objectContaining({ slot_id: 'slot-pm', maximum_points: 5, earned_points: 3 }),
    ]);
  });

  it('uses an awarded-points override instead of the normal attendance calculation', () => {
    const overriddenEvents: AssessmentEventInput[] = [{
      ...events[0],
      attendance: [
        { slot_id: 'slot-am', attendance_status: 'late', late_penalty_percent: 40, earned_points_override: 4.5 },
        { slot_id: 'slot-pm', attendance_status: 'late', late_penalty_percent: 40, earned_points_override: null },
      ],
    }];

    const result = calculateStudentAssessment('student-1', overriddenEvents, weightedPolicy);

    expect(result.earned_points).toBe(7.5);
    expect(result.contributions[0].slots).toEqual([
      expect.objectContaining({ slot_id: 'slot-am', earned_points: 4.5 }),
      expect.objectContaining({ slot_id: 'slot-pm', earned_points: 3 }),
    ]);
  });

  it('makes the selected sanction tier and threshold transparent', () => {
    const tier = selectSanctionTier(6, 0.4, weightedPolicy);
    expect(tier).toMatchObject({ label: 'Service', matched_threshold: 'Missed points >= 5' });
  });

  it('supports the percentage-based policy alternative', () => {
    const policy: SanctionPolicy = {
      ...weightedPolicy,
      id: 'policy-2',
      mode: 'attendance_percentage',
      tiers: [
        { id: 'tier-p1', label: 'Review', maximum_attendance_ratio: 0.75, obligation_text: 'Meet with an ACS officer.' },
        { id: 'tier-p2', label: 'Intervention', maximum_attendance_ratio: 0.5, obligation_text: 'Complete an attendance intervention.' },
      ],
    };

    expect(selectSanctionTier(5, 0.45, policy)).toMatchObject({
      label: 'Intervention',
      matched_threshold: 'Attendance ratio <= 50%',
    });
  });

  it('finalizes a draft snapshot once and rejects a second finalization', () => {
    const draft = { status: 'draft' as const, finalized_at: null, finalized_by: null };
    const finalized = finalizeAssessmentSnapshot(draft, 'admin-1', '2026-08-22T10:00:00.000Z');
    expect(finalized).toMatchObject({ status: 'finalized', finalized_by: 'admin-1' });
    expect(() => finalizeAssessmentSnapshot(finalized, 'admin-1')).toThrow('Only draft assessments can be finalized.');
  });
});
