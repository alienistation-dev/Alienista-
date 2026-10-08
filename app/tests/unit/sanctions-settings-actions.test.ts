import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/lib/supabase/admin', () => ({
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-1',
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createSanctionPolicyVersionAction, toggleSanctionsAction } from '@/lib/actions/settings';

const weightedPolicy = {
  name: 'Attendance obligations',
  mode: 'weighted_missed_points' as const,
  activate: true,
  tiers: [
    { label: 'Reminder', threshold: 1, obligation_text: 'Meet with an ACS officer.' },
    { label: 'Service', threshold: 5, obligation_text: 'Complete an approved service obligation.' },
  ],
};

describe('sanctions settings actions', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset().mockResolvedValue({ id: 'admin-1', organization_id: 'org-1', role: 'admin' });
    mocks.rpc.mockReset().mockResolvedValue({ data: { id: 'policy-2', version: 2 }, error: null });
  });

  it('rejects policy changes from non-admin users', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'officer-1', organization_id: 'org-1', role: 'officer' });

    await expect(createSanctionPolicyVersionAction(weightedPolicy)).resolves.toEqual({
      success: false,
      error: 'Only admins can configure sanction policies.',
    });
    await expect(toggleSanctionsAction(true)).resolves.toEqual({
      success: false,
      error: 'Only admins can enable or disable sanctions.',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...weightedPolicy, name: ' ' }, 'Policy name is required.'],
    [{ ...weightedPolicy, tiers: [] }, 'Add at least one valid sanction tier.'],
    [{ ...weightedPolicy, tiers: [{ label: '', threshold: 1, obligation_text: 'Action' }] }, 'Every tier needs a name and obligation.'],
    [{ ...weightedPolicy, tiers: [{ label: 'Bad', threshold: -1, obligation_text: 'Action' }] }, 'Weighted missed-points thresholds cannot be negative.'],
    [{ ...weightedPolicy, mode: 'attendance_percentage' as const, tiers: [{ label: 'Bad', threshold: 101, obligation_text: 'Action' }] }, 'Attendance thresholds must be between 0 and 100 percent.'],
  ])('rejects malformed policy versions', async (input, error) => {
    await expect(createSanctionPolicyVersionAction(input)).resolves.toEqual({ success: false, error });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns a validation response for a missing policy payload', async () => {
    await expect(createSanctionPolicyVersionAction(undefined as never)).resolves.toEqual({
      success: false,
      error: 'Sanction policy input is required.',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects non-boolean sanctions toggle input', async () => {
    await expect(toggleSanctionsAction('true' as never)).resolves.toEqual({
      success: false,
      error: 'Sanctions toggle must be a boolean.',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('creates and explicitly activates a new immutable policy version', async () => {
    const result = await createSanctionPolicyVersionAction(weightedPolicy);

    expect(result.success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('create_sanction_policy_version', {
      p_organization_id: 'org-1',
      p_name: weightedPolicy.name,
      p_mode: weightedPolicy.mode,
      p_tiers: weightedPolicy.tiers,
      p_activate: true,
    });
  });

  it('uses the transactional database guard when enabling sanctions', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    const result = await toggleSanctionsAction(true);

    expect(result.success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('set_sanctions_enabled', {
      p_organization_id: 'org-1',
      p_enabled: true,
    });
  });
});
