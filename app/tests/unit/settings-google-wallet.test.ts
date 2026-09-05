import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toggleGoogleWalletAction } from '@/lib/actions/settings';

const mockFrom = vi.fn();
const mockAdminClient = { from: mockFrom };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
  getEffectiveOrgId: vi.fn().mockResolvedValue('org-123'),
}));

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: 'admin-1', role: 'admin', organization_id: 'org-123' }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('toggleGoogleWalletAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates google_wallet_enabled in organization_settings', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const res = await toggleGoogleWalletAction(true);
    expect(res.success).toBe(true);
  });

  it('rejects non-admin roles', async () => {
    const { getSessionUser } = await import('@/lib/session');
    vi.mocked(getSessionUser).mockResolvedValueOnce({ id: 'student-1', role: 'student', organization_id: 'org-123' });

    const res = await toggleGoogleWalletAction(true);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/unauthorized/i);
  });
});
