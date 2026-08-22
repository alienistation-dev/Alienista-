import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));

import {
  clearLoginFailures,
  isLoginRateLimited,
  recordLoginFailure,
} from '@/lib/auth/rate-limit';

describe('deployment-safe login rate limiting', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('checks a normalized identifier through the database function', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(isLoginRateLimited('  ADMIN  ')).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('check_login_rate_limit', {
      p_identifier_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('records and clears failures without storing the raw identifier', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await recordLoginFailure('Student-001');
    await clearLoginFailures('student-001');

    const firstHash = mocks.rpc.mock.calls[0][1].p_identifier_hash;
    expect(mocks.rpc.mock.calls[0][0]).toBe('record_login_failure');
    expect(mocks.rpc.mock.calls[1]).toEqual([
      'clear_login_failures',
      { p_identifier_hash: firstHash },
    ]);
    expect(firstHash).not.toContain('student');
  });

  it('fails closed when the shared limiter cannot be checked', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });

    await expect(isLoginRateLimited('admin')).rejects.toThrow('Unable to check login rate limit.');
  });
});
