'use server';

import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { requireRole } from '@/lib/auth/guards';
import { ActionResponse } from '@/lib/types/actions';
import { Event } from '@/lib/types/models';
import { eventSchema } from '@/lib/validations/events';
import { revalidatePath } from 'next/cache';
import { withServerTiming } from '@/lib/server-timing';

export async function getEventsAction(): Promise<ActionResponse<Event[]>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { data, error } = await withServerTiming('events', async () => admin
    .from('events')
    .select('id, organization_id, name, starts_at, venue, description, status, weight, created_by_officer_id, created_at, updated_at, slots:event_slots(id, organization_id, event_id, label, slot_type, opens_at, closes_at, late_cutoff_at, late_penalty_percent, is_required, status, created_at)')
    .eq('organization_id', orgId)
    .order('starts_at', { ascending: false }));

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Event[] };
}

export async function createEventWithSlotsAction(rawInput: unknown): Promise<ActionResponse<Event>> {
  let user;
  try {
    user = await requireRole('admin');
  } catch {
    return { success: false, error: 'Only admins can create events.' };
  }

  const parsed = eventSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  const { data: event, error: eventErr } = await admin.rpc('create_event_with_slots_and_weight', {
    p_organization_id: orgId,
    p_name: parsed.data.name.trim(),
    p_starts_at: parsed.data.starts_at,
    p_venue: parsed.data.venue.trim(),
    p_description: parsed.data.description || '',
    p_status: parsed.data.status,
    p_weight: parsed.data.weight,
    p_created_by_officer_id: user.role === 'officer' ? user.id : null,
    p_slots: parsed.data.slots,
  });

  if (eventErr || !event) return { success: false, error: eventErr?.message || 'Failed to create event.' };

  revalidatePath('/events');
  return { success: true, data: event as Event };
}

export async function toggleEventStatusAction(id: string, newStatus: 'Open' | 'Closed'): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { error } = await admin
    .from('events')
    .update({ status: newStatus })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/events');
  return { success: true, data: undefined };
}

export async function deleteEventAction(id: string): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Unauthorized.' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const { error } = await admin
    .from('events')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/events');
  return { success: true, data: undefined };
}
