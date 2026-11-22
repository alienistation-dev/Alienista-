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

import { advanceSemesterAction } from '@/lib/actions/settings';

const expected = { academic_year: '2026-2027', semester: 'Second Semester' as const };

describe('advanceSemesterAction', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset().mockResolvedValue({ id: 'admin-1', organization_id: 'org-1', role: 'admin' });
    mocks.rpc.mockReset().mockResolvedValue({ data: { message: 'Started Academic Year 2027-2028 (First Semester).' }, error: null });
    mocks.from.mockReset();
  });

  it('advances through one locked RPC with the term the admin saw', async () => {
    const result = await advanceSemesterAction(expected);

    expect(result).toEqual({ success: true, data: { message: 'Started Academic Year 2027-2028 (First Semester).' } });
    expect(mocks.rpc).toHaveBeenCalledWith('advance_organization_semester', {
      p_organization_id: 'org-1',
      p_expected_academic_year: '2026-2027',
      p_expected_semester: 'Second Semester',
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('reports a stale term instead of advancing twice', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Academic term changed. Reload settings before advancing.' } });

    await expect(advanceSemesterAction(expected)).resolves.toEqual({
      success: false,
      error: 'Academic term changed. Reload settings before advancing.',
    });
  });

  it('rejects malformed expected terms and non-admins before touching the database', async () => {
    await expect(advanceSemesterAction({ academic_year: '2026', semester: 'Second Semester' })).resolves.toMatchObject({ success: false });
    mocks.getSessionUser.mockResolvedValue({ id: 'officer-1', organization_id: 'org-1', role: 'officer' });
    await expect(advanceSemesterAction(expected)).resolves.toEqual({ success: false, error: 'Unauthorized.' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
