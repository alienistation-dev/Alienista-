import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), createAdminClient: vi.fn() }));

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-1',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { calculateSemesterAssessment, finalizeSemesterAssessment } from '@/lib/actions/assessments';

describe('assessment action authorization', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset();
    mocks.createAdminClient.mockReset();
  });

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

  it.each([
    ['calculate', () => calculateSemesterAssessment('2026-2027:First Semester')],
    ['finalize', () => finalizeSemesterAssessment('assessment-1')],
  ])('does not %s assessments while sanctions are disabled', async (_label, action) => {
    mocks.getSessionUser.mockResolvedValue({ id: 'admin-1', organization_id: 'org-1', role: 'admin' });
    mocks.createAdminClient.mockReturnValue({
      from: () => {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({
            data: { academic_year: '2026-2027', semester: 'First Semester', sanctions_enabled: false },
            error: null,
          }),
        };
        return builder;
      },
    });

    await expect(action()).resolves.toEqual({
      success: false,
      error: 'Sanctions are disabled in organization settings.',
    });
  });

  it('finalizes only drafts calculated with the currently active policy', async () => {
    const assessmentFilters: Array<[string, unknown]> = [];
    mocks.getSessionUser.mockResolvedValue({ id: 'admin-1', organization_id: 'org-1', role: 'admin' });
    mocks.createAdminClient.mockReturnValue({
      from: (table: string) => {
        const builder: Record<string, unknown> = {
          select: () => builder,
          update: () => builder,
          eq: (column: string, value: unknown) => {
            if (table === 'semester_assessments') assessmentFilters.push([column, value]);
            return builder;
          },
          maybeSingle: async () => {
            if (table === 'organization_settings') return { data: { sanctions_enabled: true }, error: null };
            if (table === 'sanction_policies') return { data: { id: 'policy-active' }, error: null };
            return { data: { id: 'assessment-1', status: 'finalized' }, error: null };
          },
        };
        return builder;
      },
    });

    const result = await finalizeSemesterAssessment('assessment-1');

    expect(result.success).toBe(true);
    expect(assessmentFilters).toContainEqual(['policy_id', 'policy-active']);
  });
});
