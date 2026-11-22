import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleted: [{ id: 'student-1' }] as Array<{ id: string }>,
  deactivate: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSessionUser: async () => ({ id: 'admin-1', organization_id: 'org-1', role: 'admin' }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getEffectiveOrgId: async () => 'org-1',
  createAdminClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {
        delete: () => builder,
        eq: () => builder,
        select: async () => ({ data: mocks.deleted, error: null }),
      };
      return builder;
    },
  }),
}));
vi.mock('@/lib/badges/google-wallet', () => ({
  syncGoogleWalletObject: vi.fn(),
  deactivateGoogleWalletObject: mocks.deactivate,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { deleteStudentAction } from '@/lib/actions/students';

describe('deleteStudentAction Wallet state', () => {
  beforeEach(() => {
    mocks.deleted = [{ id: 'student-1' }];
    mocks.deactivate.mockReset().mockResolvedValue({ status: 'updated' });
  });

  it('sets the deleted student pass INACTIVE', async () => {
    await expect(deleteStudentAction('student-1')).resolves.toEqual({ success: true, data: undefined });
    expect(mocks.deactivate).toHaveBeenCalledWith('student-1');
  });

  it('still returns success when the Wallet API fails', async () => {
    mocks.deactivate.mockResolvedValue({ status: 'failed', error: 'Wallet object update failed (500).' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(deleteStudentAction('student-1')).resolves.toEqual({ success: true, data: undefined });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not touch Wallet when no student in this organization was deleted', async () => {
    mocks.deleted = [];
    await deleteStudentAction('other-org-student');
    expect(mocks.deactivate).not.toHaveBeenCalled();
  });
});
