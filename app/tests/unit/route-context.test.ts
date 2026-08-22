import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => {
      let initialized = false;
      let value: unknown;
      return (async (...args: never[]) => {
        if (!initialized) {
          value = await fn(...args);
          initialized = true;
        }
        return value;
      }) as T;
    },
  };
});

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), getEffectiveOrgId: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/lib/supabase/admin', () => ({
  getEffectiveOrgId: mocks.getEffectiveOrgId,
  createAdminClient: mocks.createAdminClient,
}));

import { getRouteRequestContext } from '@/lib/route-context';

describe('route request context', () => {
  it('resolves session, organization, and admin client once per request', async () => {
    const admin = {};
    mocks.getSessionUser.mockResolvedValue({ id: 'u1', subject_id: 'u1', subject_type: 'admin', role: 'admin', organization_id: 'org-1', name: 'Admin', issued_at: 1, expires_at: 2 });
    mocks.getEffectiveOrgId.mockResolvedValue('org-1');
    mocks.createAdminClient.mockReturnValue(admin);
    const first = await getRouteRequestContext();
    const second = await getRouteRequestContext();
    expect(first).toMatchObject({ organizationId: 'org-1', admin });
    expect(second).toMatchObject({ organizationId: 'org-1', admin });
    expect(mocks.getSessionUser).toHaveBeenCalledOnce();
    expect(mocks.getEffectiveOrgId).toHaveBeenCalledOnce();
    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
  });
});
