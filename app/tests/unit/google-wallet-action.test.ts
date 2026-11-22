import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: { data: { google_wallet_enabled: true, google_wallet_design: 'builder' } as unknown, error: null as unknown },
  student: { id: 'student-1', status: 'Active' } as Record<string, unknown>,
  issue: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSessionUser: async () => ({ id: 'student-1', organization_id: 'org-1', role: 'student' }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getEffectiveOrgId: async () => 'org-1',
  createAdminClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => table === 'organization_settings'
          ? mocks.settings
          : { data: mocks.student, error: null },
      };
      return builder;
    },
  }),
}));
vi.mock('@/lib/badges/google-wallet', () => ({ issueGoogleWalletSaveUrl: mocks.issue }));

import { getStudentGoogleWalletUrlAction } from '@/lib/actions/google-wallet';

describe('getStudentGoogleWalletUrlAction', () => {
  beforeEach(() => {
    mocks.settings = { data: { google_wallet_enabled: true, google_wallet_design: 'builder' }, error: null };
    mocks.student = { id: 'student-1', status: 'Active' };
    mocks.issue.mockReset().mockResolvedValue({ status: 'issued', url: 'https://pay.google.com/gp/v/save/jwt' });
  });

  it('returns the issued save URL for an active student', async () => {
    await expect(getStudentGoogleWalletUrlAction()).resolves.toEqual({
      success: true,
      data: { url: 'https://pay.google.com/gp/v/save/jwt' },
    });
  });

  it('fails closed when the organization settings read fails', async () => {
    mocks.settings = { data: null, error: { message: 'database unavailable' } };
    const result = await getStudentGoogleWalletUrlAction();
    expect(result.success).toBe(false);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('refuses issuance for a non-Active student', async () => {
    mocks.student = { id: 'student-1', status: 'Inactive' };
    const result = await getStudentGoogleWalletUrlAction();
    expect(result.success).toBe(false);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('returns no link when the Wallet object cannot be saved', async () => {
    mocks.issue.mockResolvedValue({ status: 'failed', error: 'Wallet object save failed (500).' });
    const result = await getStudentGoogleWalletUrlAction();
    expect(result.success).toBe(false);
  });
});
