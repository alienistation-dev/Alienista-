import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn() }));

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));

import { requireRole, requireSession } from '@/lib/auth/guards';

describe('central authorization guards', () => {
  beforeEach(() => mocks.getSessionUser.mockReset());

  it('rejects unauthenticated requests', async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow('Authentication required.');
  });

  it('returns the authenticated session', async () => {
    const user = { id: 'admin-1', organization_id: 'org-1', role: 'admin', name: 'Admin' };
    mocks.getSessionUser.mockResolvedValue(user);
    await expect(requireSession()).resolves.toBe(user);
  });

  it('rejects a role outside the allowed set', async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: 'student-1',
      organization_id: 'org-1',
      role: 'student',
      name: 'Student',
    });

    await expect(requireRole('admin', 'officer')).rejects.toThrow('Insufficient permissions.');
  });
});
