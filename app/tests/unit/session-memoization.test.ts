import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T) => {
    let resolved: unknown;
    let initialized = false;
    return (async (...args: never[]) => {
      if (!initialized) { resolved = await fn(...args); initialized = true; }
      return resolved;
    }) as T;
  } };
});
vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
  headers: vi.fn(async () => new Headers()),
}));

import { getSessionUser, signSession } from '@/lib/session';

describe('request session memoization', () => {
  beforeEach(() => mocks.cookies.mockReset());

  it('reads and verifies the session cookie once for repeated access in one request', async () => {
    const user = {
      id: 'officer-1', subject_id: 'officer-1', subject_type: 'officer' as const,
      organization_id: 'org-1', role: 'officer' as const, name: 'Officer',
      issued_at: Date.now(), expires_at: Date.now() + 60_000,
    };
    const token = await signSession(user);
    mocks.cookies.mockResolvedValue({ get: () => ({ value: token }) });

    const first = await getSessionUser();
    const second = await getSessionUser();

    expect(first?.id).toBe('officer-1');
    expect(second?.id).toBe('officer-1');
    expect(mocks.cookies).toHaveBeenCalledOnce();
  });
});
