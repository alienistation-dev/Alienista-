import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));

import { allocateStudentUid } from '@/lib/students/uid';

describe('database-owned student UID allocation', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('delegates allocation to the organization-scoped database function', async () => {
    mocks.rpc.mockResolvedValue({ data: 'ST-2026-0001', error: null });

    await expect(allocateStudentUid('org-1', 2026)).resolves.toBe('ST-2026-0001');
    expect(mocks.rpc).toHaveBeenCalledWith('allocate_student_uid', {
      p_organization_id: 'org-1',
      p_year: 2026,
    });
  });

  it('returns distinct values from concurrent database allocations', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: 'ST-2026-0001', error: null })
      .mockResolvedValueOnce({ data: 'ST-2026-0002', error: null });

    const allocated = await Promise.all([
      allocateStudentUid('org-1', 2026),
      allocateStudentUid('org-1', 2026),
    ]);

    expect(new Set(allocated).size).toBe(2);
  });
});
