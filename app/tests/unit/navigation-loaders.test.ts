import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), from: vi.fn() }));

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-1',
}));

import { getDashboardDataAction } from '@/lib/actions/dashboard';
import { getBadgeStudentsAction, getScannerStudentsAction } from '@/lib/actions/students';

function query(data: unknown) {
  const state: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    select: (selection: string) => { state.selection = selection; return builder; },
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve({ data, error: null }),
  };
  return { builder, state };
}

describe('navigation data loaders', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockResolvedValue({ organization_id: 'org-1', role: 'admin', id: 'admin-1', name: 'Admin' });
    mocks.from.mockReset();
  });

  it('loads dashboard projections in parallel without requesting unused events', async () => {
    const tables: string[] = [];
    mocks.from.mockImplementation((table: string) => {
      tables.push(table);
      return query(table === 'v_dashboard_stats' ? { total_students: 1 } : []).builder;
    });

    const result = await getDashboardDataAction();
    expect(result.success).toBe(true);
    expect(tables).toEqual(expect.arrayContaining(['v_dashboard_stats', 'v_attendance_details']));
    expect(tables).not.toContain('events');
  });

  it('uses narrow roster and badge projections', async () => {
    const selections: Record<string, string[]> = {};
    mocks.from.mockImplementation((table: string) => {
      const built = query([]);
      const originalSelect = built.builder.select as (selection: string) => unknown;
      built.builder.select = (selection: string) => { selections[table] = [...(selections[table] || []), selection]; return originalSelect(selection); };
      return built.builder;
    });

    await getScannerStudentsAction();
    await getBadgeStudentsAction();

    expect(selections.students).toContain('id, organization_id, uid, student_number, full_name, status, avatar_url');
    expect(selections.students).toContain('id, uid, student_number, full_name, course, year, section, status, avatar_url');
  });
});
