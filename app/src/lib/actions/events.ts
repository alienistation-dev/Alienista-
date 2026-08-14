'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';
import { Event } from '@/lib/types/models';
import { eventSchema } from '@/lib/validations/events';
import { revalidatePath } from 'next/cache';

export async function getEventsAction(): Promise<ActionResponse<Event[]>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('events')
    .select('*, slots:event_slots(*)')
    .eq('organization_id', user.organization_id)
    .order('starts_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Event[] };
}

export async function createEventWithSlotsAction(rawInput: unknown): Promise<ActionResponse<Event>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can create events.' };

  const parsed = eventSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const admin = createAdminClient();

  const { data: event, error: eventErr } = await admin
    .from('events')
    .insert({
      organization_id: user.organization_id,
      name: parsed.data.name.trim(),
      starts_at: parsed.data.starts_at,
      venue: parsed.data.venue.trim(),
      description: parsed.data.description || '',
      status: parsed.data.status,
      created_by_officer_id: user.id,
    })
    .select()
    .single();

  if (eventErr || !event) return { success: false, error: eventErr?.message || 'Failed to create event.' };

  if (parsed.data.slots && parsed.data.slots.length > 0) {
    const slotInserts = parsed.data.slots.map((s) => ({
      organization_id: user.organization_id,
      event_id: event.id,
      label: s.label,
      slot_type: s.slot_type,
      opens_at: s.opens_at,
      closes_at: s.closes_at,
    }));

    await admin.from('event_slots').insert(slotInserts);
  }

  revalidatePath('/events');
  return { success: true, data: event as Event };
}

export async function toggleEventStatusAction(id: string, newStatus: 'Open' | 'Closed'): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('events')
    .update({ status: newStatus })
    .eq('id', id)
    .eq('organization_id', user.organization_id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/events');
  return { success: true, data: undefined };
}

export async function deleteEventAction(id: string): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('events')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/events');
  return { success: true, data: undefined };
}
