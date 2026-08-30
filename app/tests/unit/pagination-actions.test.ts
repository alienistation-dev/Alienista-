import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), from: vi.fn() }));

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-1',
}));
vi.mock('@/lib/route-context', () => ({
  getRouteRequestContext: async () => ({
    organizationId: 'org-1',
    admin: { from: mocks.from },
    user: { role: 'admin' },
  }),
}));

import { getBadgeStudentsAction, getStudentsAction } from '@/lib/actions/students';
import { getStudentStatisticsAction } from '@/lib/actions/statistics';

function paginatedQuery(data: unknown[], count: number) {
  const state = {
    selection: '',
    countOption: '',
    filters: [] as Array<[string, unknown]>,
    search: '',
    range: [] as number[],
  };
  const builder: Record<string, unknown> = {
    select: (selection: string, options?: { count?: string }) => {
      state.selection = selection;
      state.countOption = options?.count || '';
      return builder;
    },
    eq: (column: string, value: unknown) => {
      state.filters.push([column, value]);
      return builder;
    },
    or: (value: string) => {
      state.search = value;
      return builder;
    },
    order: () => builder,
    range: (from: number, to: number) => {
      state.range = [from, to];
      return Promise.resolve({ data, count, error: null });
    },
  };
  return { builder, state };
}

describe('server-backed pagination actions', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockResolvedValue({ organization_id: 'org-1', role: 'admin' });
    mocks.from.mockReset();
  });

  it('pages and filters the student directory before returning results', async () => {
    const query = paginatedQuery([{ id: 'student-11', full_name: 'Ada Lovelace' }], 21);
    mocks.from.mockReturnValue(query.builder);

    const result = await getStudentsAction({
      page: 2,
      pageSize: 10,
      query: 'Ada, (Lovelace)',
      year: '4th Year',
      status: 'Active',
    });

    expect(result).toEqual({
      success: true,
      data: { items: [{ id: 'student-11', full_name: 'Ada Lovelace' }], total: 21, page: 2, pageSize: 10 },
    });
    expect(query.state.countOption).toBe('exact');
    expect(query.state.filters).toEqual(expect.arrayContaining([
      ['organization_id', 'org-1'],
      ['year', '4th Year'],
      ['status', 'Active'],
    ]));
    expect(query.state.search).toBe('full_name.ilike.%Ada Lovelace%,uid.ilike.%Ada Lovelace%,student_number.ilike.%Ada Lovelace%');
    expect(query.state.range).toEqual([10, 19]);
  });

  it('uses the badge page size and returns the exact matching total', async () => {
    const query = paginatedQuery([], 17);
    mocks.from.mockReturnValue(query.builder);

    const result = await getBadgeStudentsAction({ page: 3, pageSize: 8, query: '' });

    expect(result).toEqual({ success: true, data: { items: [], total: 17, page: 3, pageSize: 8 } });
    expect(query.state.range).toEqual([16, 23]);
  });

  it('paginates student statistics after applying the year filter', async () => {
    const query = paginatedQuery([{ uid: 'ST-1', name: 'Ada', year: '4th Year', count: 3, attendance_pct: 75 }], 12);
    mocks.from.mockReturnValue(query.builder);

    const result = await getStudentStatisticsAction({ page: 1, pageSize: 25, year: '4th Year' });

    expect(result).toEqual({
      success: true,
      data: {
        items: [{ uid: 'ST-1', name: 'Ada', year: '4th Year', count: 3, attendance_pct: 75 }],
        total: 12,
        page: 1,
        pageSize: 25,
      },
    });
    expect(query.state.filters).toContainEqual(['year', '4th Year']);
    expect(query.state.range).toEqual([0, 24]);
  });
});
