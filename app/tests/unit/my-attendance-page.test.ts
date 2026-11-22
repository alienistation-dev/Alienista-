import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), requested: [] as string[] }));

vi.mock('@/lib/session', () => ({
  getSessionUser: async () => ({ id: 'student-1', role: 'student', uid: 'ST-001', organization_id: 'org-1' }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-1',
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import MyAttendancePage from '@/app/(student)/my-attendance/page';

// Resolves only after both tables were requested, so sequential awaits would hang.
function query(table: string, data: unknown) {
  mocks.requested.push(table);
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    then: (resolve: (value: unknown) => unknown) => {
      const waitForBoth = () => mocks.requested.length >= 2
        ? resolve({ data, error: null })
        : setTimeout(waitForBoth, 5);
      waitForBoth();
    },
  };
  return builder;
}

const record = (id: string, event_id: string) => ({
  id, event_id, event_name: 'Assembly', recorded_at: '2026-11-20T01:00:00Z', officer_name: null,
});

async function render(attendance: unknown[], events: unknown[]) {
  mocks.from.mockImplementation((table: string) => query(table, table === 'events' ? events : attendance));
  return renderToStaticMarkup(await MyAttendancePage());
}

describe('my attendance page', () => {
  beforeEach(() => {
    mocks.requested = [];
    mocks.from.mockReset();
  });

  it('counts an event with two slot scans once', async () => {
    const html = await render([record('a1', 'event-1'), record('a2', 'event-1')], [{ id: 'event-1' }]);
    expect(html).toContain('out of 1 event<');
    expect(html).toContain('>100%<');
  });

  it('shows zero events and 0% when the organization has no events', async () => {
    const html = await render([], []);
    expect(html).toContain('out of 0 events');
    expect(html).toContain('>0%<');
  });
});
