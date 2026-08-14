import { z } from 'zod';

export const eventSlotSchema = z.object({
  label: z.string().min(1, 'Slot label is required'),
  slot_type: z.enum(['am_in', 'am_out', 'pm_in', 'pm_out', 'other']),
  opens_at: z.string(),
  closes_at: z.string(),
});

export const eventSchema = z.object({
  name: z.string().min(2, 'Event name is required'),
  starts_at: z.string().min(1, 'Date and time are required'),
  venue: z.string().min(1, 'Venue is required'),
  description: z.string().optional().default(''),
  status: z.enum(['Open', 'Closed']).default('Open'),
  slots: z.array(eventSlotSchema).optional().default([]),
});
