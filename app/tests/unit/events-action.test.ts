import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
  getEffectiveOrgId: async (organizationId?: string) => organizationId || 'org-default',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createEventWithSlotsAction, getEventsAction } from '@/lib/actions/events';

function eventsQuery(data: unknown) {
  const state = { selection: '', organizationId: '' };
  const builder: Record<string, unknown> = {
    select: (selection: string) => { state.selection = selection; return builder; },
    eq: (column: string, value: string) => { if (column === 'organization_id') state.organizationId = value; return builder; },
    order: () => builder,
    then: (resolve: (value: unknown) => unknown) => resolve({ data, error: null }),
  };
  return { builder, state };
}

describe('event creation authorization and attribution', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.from.mockReset();
    mocks.rpc.mockResolvedValue({
      data: {
        id: 'event-1',
        organization_id: 'org-1',
        name: 'General Assembly',
        starts_at: '2026-08-22T08:00:00.000Z',
        venue: 'Gym',
        description: '',
        status: 'Open',
        weight: 1,
      },
      error: null,
    });
  });

  it('keeps event reads compatible before the term_key migration is applied', async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: 'admin-1',
      organization_id: 'org-1',
      role: 'admin',
      name: 'Admin',
    });
    const query = eventsQuery([]);
    mocks.from.mockReturnValue(query.builder);

    const result = await getEventsAction();

    expect(result).toEqual({ success: true, data: [] });
    expect(query.state.organizationId).toBe('org-1');
    expect(query.state.selection).not.toContain('term_key');
  });

  it('never writes an admin UUID into the officer foreign key', async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: '2182162f-0614-45f4-9c3b-32f18b00eec7',
      organization_id: 'org-1',
      role: 'admin',
      name: 'Admin',
    });

    const result = await createEventWithSlotsAction({
      name: 'General Assembly',
      starts_at: '2026-08-22T08:00:00.000Z',
      venue: 'Gym',
      status: 'Open',
      slots: [],
    });

    expect(result.success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_event_with_slots_and_weight',
      expect.objectContaining({ p_created_by_officer_id: null, p_weight: 1 })
    );
  });

  it('rejects officer event creation', async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: 'officer-1',
      organization_id: 'org-1',
      role: 'officer',
      name: 'Officer',
    });

    const result = await createEventWithSlotsAction({
      name: 'General Assembly',
      starts_at: '2026-08-22T08:00:00.000Z',
      venue: 'Gym',
      status: 'Open',
      slots: [],
    });

    expect(result).toMatchObject({ success: false, error: 'Only admins can create events.' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns a failure when the transactional database function rejects a slot', async () => {
    mocks.getSessionUser.mockResolvedValue({
      id: 'admin-1',
      organization_id: 'org-1',
      role: 'admin',
      name: 'Admin',
    });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'slot insert failed' } });

    const result = await createEventWithSlotsAction({
      name: 'General Assembly',
      starts_at: '2026-08-22T08:00:00.000Z',
      venue: 'Gym',
      weight: 10,
      status: 'Open',
      slots: [{
        label: 'Morning In',
        slot_type: 'am_in',
        opens_at: '2026-08-22T08:00:00.000Z',
        late_cutoff_at: '2026-08-22T08:15:00.000Z',
        closes_at: '2026-08-22T09:00:00.000Z',
        late_penalty_percent: 25,
        is_required: true,
      }],
    });

    expect(result).toEqual({ success: false, error: 'slot insert failed' });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
});
