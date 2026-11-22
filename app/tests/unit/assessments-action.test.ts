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

  it('saves drafts with the attendance revision the database guard checks', async () => {
    const upserts: Array<Record<string, unknown>> = [];
    mocks.getSessionUser.mockResolvedValue({ id: 'admin-1', organization_id: 'org-1', role: 'admin' });
    mocks.createAdminClient.mockReturnValue({
      from: (table: string) => {
        const rows: Record<string, unknown> = {
          organization_settings: { academic_year: '2026-2027', semester: 'First Semester', sanctions_enabled: true, attendance_revision: 7 },
          sanction_policies: { id: 'policy-1', version: 1, mode: 'weighted_missed_points', sanction_tiers: [] },
        };
        const lists: Record<string, unknown[]> = { students: [{ id: 'student-1' }], events: [], semester_assessments: [] };
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => builder,
          upsert: (payload: Record<string, unknown>) => { upserts.push(payload); return builder; },
          single: async () => ({ data: { id: 'assessment-1', ...upserts.at(-1) }, error: null }),
          maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
          then: (resolve: (value: unknown) => unknown) => resolve({ data: lists[table] ?? [], error: null }),
        };
        return builder;
      },
    });

    const result = await calculateSemesterAssessment('2026-2027:First Semester');

    expect(result.success).toBe(true);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ student_id: 'student-1', attendance_revision: 7 });
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
