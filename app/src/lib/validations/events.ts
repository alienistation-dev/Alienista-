import { z } from 'zod';

export const eventSlotSchema = z.object({
  label: z.string().min(1, 'Slot label is required'),
  slot_type: z.enum(['am_in', 'am_out', 'pm_in', 'pm_out', 'other']),
  opens_at: z.iso.datetime(),
  closes_at: z.iso.datetime(),
  late_cutoff_at: z.iso.datetime().nullable().optional(),
  late_penalty_percent: z.number().min(0).max(100).default(0),
  is_required: z.boolean().default(true),
}).superRefine((slot, ctx) => {
  const opensAt = new Date(slot.opens_at).getTime();
  const closesAt = new Date(slot.closes_at).getTime();
  const lateCutoffAt = slot.late_cutoff_at ? new Date(slot.late_cutoff_at).getTime() : null;

  if (closesAt < opensAt) {
    ctx.addIssue({ code: 'custom', path: ['closes_at'], message: 'Slot close time must be after its open time' });
  }
  if (lateCutoffAt !== null && (lateCutoffAt < opensAt || lateCutoffAt > closesAt)) {
    ctx.addIssue({ code: 'custom', path: ['late_cutoff_at'], message: 'Late cutoff must be inside the slot window' });
  }
});

export const eventSchema = z.object({
  name: z.string().min(2, 'Event name is required'),
  starts_at: z.string().min(1, 'Date and time are required'),
  venue: z.string().min(1, 'Venue is required'),
  description: z.string().optional().default(''),
  status: z.enum(['Open', 'Closed']).default('Open'),
  weight: z.number().int().min(1).max(20).default(1),
  slots: z.array(eventSlotSchema).optional().default([]),
});
