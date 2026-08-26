import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn() }));

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-1',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { calculateSemesterAssessment, finalizeSemesterAssessment } from '@/lib/actions/assessments';

describe('assessment action authorization', () => {
  beforeEach(() => mocks.getSessionUser.mockReset());

  it('does not let officers calculate assessments', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'officer-1', subject_id: 'officer-1', subject_type: 'officer', organization_id: 'org-1', role: 'officer', name: 'Officer', issued_at: 1, expires_at: 2 });
    await expect(calculateSemesterAssessment('2026-2027:First Semester')).resolves.toMatchObject({
      success: false,
      error: 'Only admins can calculate assessments.',
    });
  });

  it('does not let unauthenticated callers finalize assessments', async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    await expect(finalizeSemesterAssessment('assessment-1')).resolves.toMatchObject({
      success: false,
      error: 'Only admins can finalize assessments.',
    });
  });
});
