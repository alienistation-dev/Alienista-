import { describe, it, expect } from 'vitest';
import { EventSlot } from '@/lib/types/models';

function resolveActiveSlot(slots: EventSlot[], scanTime: Date): EventSlot | null {
  const match = slots.find((slot) => {
    const open = new Date(slot.opens_at);
    const close = new Date(slot.closes_at);
    return scanTime >= open && scanTime <= close;
  });
  return match || null;
}

describe('Event Slot Time Window Resolution', () => {
  const mockSlots: EventSlot[] = [
    {
      id: 'slot_am_in',
      organization_id: 'org_1',
      event_id: 'event_1',
      label: 'Morning Time-In',
      slot_type: 'am_in',
      opens_at: '2026-08-15T08:00:00.000Z',
      closes_at: '2026-08-15T09:00:00.000Z',
      late_cutoff_at: null,
      late_penalty_percent: 0,
      is_required: true,
      status: 'active',
      created_at: new Date().toISOString(),
    },
    {
      id: 'slot_pm_out',
      organization_id: 'org_1',
      event_id: 'event_1',
      label: 'Afternoon Time-Out',
      slot_type: 'pm_out',
      opens_at: '2026-08-15T16:00:00.000Z',
      closes_at: '2026-08-15T17:00:00.000Z',
      late_cutoff_at: null,
      late_penalty_percent: 0,
      is_required: true,
      status: 'upcoming',
      created_at: new Date().toISOString(),
    },
  ];

  it('should accept scan precisely within Morning Time-In window', () => {
    const validScanTime = new Date('2026-08-15T08:30:00.000Z');
    const slot = resolveActiveSlot(mockSlots, validScanTime);
    expect(slot).not.toBeNull();
    expect(slot?.id).toBe('slot_am_in');
    expect(slot?.label).toBe('Morning Time-In');
  });

  it('should accept scan on exact boundary opening and closing second', () => {
    const openExact = new Date('2026-08-15T08:00:00.000Z');
    const closeExact = new Date('2026-08-15T09:00:00.000Z');

    expect(resolveActiveSlot(mockSlots, openExact)?.id).toBe('slot_am_in');
    expect(resolveActiveSlot(mockSlots, closeExact)?.id).toBe('slot_am_in');
  });

  it('should reject scan outside time windows (between AM and PM)', () => {
    const noonScanTime = new Date('2026-08-15T12:00:00.000Z');
    const slot = resolveActiveSlot(mockSlots, noonScanTime);
    expect(slot).toBeNull();
  });

  it('should reject scan before the event opens or after closing', () => {
    const tooEarly = new Date('2026-08-15T07:59:59.000Z');
    const tooLate = new Date('2026-08-15T17:00:01.000Z');

    expect(resolveActiveSlot(mockSlots, tooEarly)).toBeNull();
    expect(resolveActiveSlot(mockSlots, tooLate)).toBeNull();
  });
});
