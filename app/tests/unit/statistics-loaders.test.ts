import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRouteRequestContext: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/route-context', () => ({ getRouteRequestContext: mocks.getRouteRequestContext }));

import { getStatisticsOverviewAction, getStudentStatisticsAction } from '@/lib/actions/statistics';

function query(data: unknown, error: { message: string } | null = null) {
  const state = { selection: '', organizationId: '' };
  const builder: Record<string, unknown> = {
    select: (selection: string) => { state.selection = selection; return builder; },
    eq: (column: string, value: string) => { if (column === 'organization_id') state.organizationId = value; return builder; },
    order: () => builder,
    limit: () => builder,
    then: (resolve: (value: unknown) => unknown) => resolve({ data, error }),
  };
  return { builder, state };
}

describe('statistics route loaders', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.getRouteRequestContext.mockResolvedValue({ organizationId: 'org-1', admin: { from: mocks.from }, user: { role: 'admin' } });
  });

  it('loads only event and officer summaries for the first-content overview', async () => {
    const tables: string[] = [];
    const states: Record<string, { selection: string; organizationId: string }> = {};
    mocks.from.mockImplementation((table: string) => {
      tables.push(table);
      const built = query(table === 'v_statistics_event_summary' ? [{ label: 'Assembly', count: 2, active_students: 4 }] : [{ officer_name: 'Officer', count: 2 }]);
      states[table] = built.state;
      return built.builder;
    });

    const result = await getStatisticsOverviewAction();

    expect(result).toEqual({ success: true, data: { byEventPct: [{ label: 'Assembly', count: 2, pct: 50 }], officerLogs: { Officer: 2 } } });
    expect(tables).toEqual(expect.arrayContaining(['v_statistics_event_summary', 'v_statistics_officer_summary']));
    expect(tables).not.toContain('v_statistics_student_summary');
    expect(tables).not.toContain('v_attendance_details');
    expect(states.v_statistics_event_summary.organizationId).toBe('org-1');
    expect(states.v_statistics_officer_summary.organizationId).toBe('org-1');
  });

  it('loads student summaries independently with the narrow projection', async () => {
    let state: { selection: string; organizationId: string } | undefined;
    mocks.from.mockImplementation((table: string) => {
      const built = query([{ uid: 'ST-1', name: 'Ada', year: '4th Year', count: 3, attendance_pct: 75 }]);
      if (table === 'v_statistics_student_summary') state = built.state;
      return built.builder;
    });

    const result = await getStudentStatisticsAction();

    expect(result).toEqual({ success: true, data: { studentsStats: [{ uid: 'ST-1', name: 'Ada', year: '4th Year', count: 3, attendance_pct: 75 }] } });
    expect(state?.selection).toBe('uid, name, year, count, attendance_pct');
    expect(state?.organizationId).toBe('org-1');
  });

  it('returns an actionable failure when the overview query fails', async () => {
    mocks.from.mockImplementation((table: string) => query([], table === 'v_statistics_event_summary' ? { message: 'summary unavailable' } : null).builder);
    await expect(getStatisticsOverviewAction()).resolves.toEqual({ success: false, error: 'summary unavailable' });
  });

  it('returns an actionable failure when the deferred student query fails', async () => {
    mocks.from.mockImplementation(() => query([], { message: 'student summary unavailable' }).builder);
    await expect(getStudentStatisticsAction()).resolves.toEqual({ success: false, error: 'student summary unavailable' });
  });

  it('performs fresh overview reads for separate action calls', async () => {
    const tables: string[] = [];
    mocks.from.mockImplementation((table: string) => {
      tables.push(table);
      return query([]).builder;
    });

    await getStatisticsOverviewAction();
    await getStatisticsOverviewAction();

    expect(tables).toHaveLength(4);
  });
});
