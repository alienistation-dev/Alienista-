'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';

export async function recordScanAction(input: {
  student_uid: string;
  event_id: string;
  slot_id?: string | null;
  client_id?: string;
  timestamp?: string;
}): Promise<ActionResponse<{ student_name: string; event_name: string; timestamp: string }>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized.' };

  const admin = createAdminClient();
  const scanTime = input.timestamp ? new Date(input.timestamp) : new Date();

  // 1. Resolve student
  const { data: student } = await admin
    .from('students')
    .select('id, full_name, status')
    .eq('uid', input.student_uid.trim())
    .eq('organization_id', user.organization_id)
    .single();

  if (!student) return { success: false, error: 'Student UID not found.' };
  if (student.status !== 'Active') return { success: false, error: 'Student account is inactive.' };

  // 2. Resolve event & slots
  const { data: event } = await admin
    .from('events')
    .select('id, name, status, slots:event_slots(*)')
    .eq('id', input.event_id)
    .eq('organization_id', user.organization_id)
    .single();

  if (!event) return { success: false, error: 'Event not found.' };
  if (event.status !== 'Open') return { success: false, error: 'Event is closed for attendance.' };

  // 3. Validate slot window if event has slots
  let activeSlotId = input.slot_id || null;
  if (event.slots && event.slots.length > 0) {
    const validSlot = event.slots.find((slot: any) => {
      const open = new Date(slot.opens_at);
      const close = new Date(slot.closes_at);
      return scanTime >= open && scanTime <= close;
    });

    if (!validSlot) {
      return { success: false, error: 'Scan rejected: Outside active attendance window.' };
    }
    activeSlotId = validSlot.id;
  }

  // 4. Duplicate Check
  const { data: existing } = await admin
    .from('attendance_records')
    .select('id')
    .eq('student_id', student.id)
    .eq('event_id', event.id)
    .eq('slot_id', activeSlotId || '00000000-0000-0000-0000-000000000000')
    .maybeSingle();

  if (existing) {
    return { success: false, error: 'Already scanned for this session.', code: 'DUPLICATE' };
  }

  // 5. Insert Attendance
  const { error: insertErr } = await admin.from('attendance_records').insert({
    organization_id: user.organization_id,
    student_id: student.id,
    event_id: event.id,
    slot_id: activeSlotId,
    officer_id: user.role === 'officer' ? user.id : null,
    officer_name: user.name,
    client_id: input.client_id || null,
    recorded_at: scanTime.toISOString(),
  });

  if (insertErr) {
    if (insertErr.code === '23505') {
      return { success: false, error: 'Already recorded.', code: 'DUPLICATE' };
    }
    return { success: false, error: insertErr.message };
  }

  return {
    success: true,
    data: {
      student_name: student.full_name,
      event_name: event.name,
      timestamp: scanTime.toISOString(),
    },
  };
}

export async function bulkSyncScansAction(scans: any[]): Promise<ActionResponse<any[]>> {
  const results = [];
  for (const scan of scans) {
    const res = await recordScanAction(scan);
    results.push({
      client_id: scan.client_id,
      success: res.success,
      error: !res.success ? res.error : undefined,
      code: !res.success ? res.code : undefined,
      data: res.success ? res.data : undefined,
    });
  }
  return { success: true, data: results };
}

export async function manualAttendanceOverrideAction(input: {
  student_id: string;
  event_id: string;
  slot_id?: string | null;
}): Promise<ActionResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { success: false, error: 'Only admins can perform manual override.' };

  const admin = createAdminClient();
  const { error } = await admin.from('attendance_records').insert({
    organization_id: user.organization_id,
    student_id: input.student_id,
    event_id: input.event_id,
    slot_id: input.slot_id || null,
    officer_name: 'Admin (Manual Override)',
  });

  if (error) {
    if (error.code === '23505') return { success: false, error: 'Student already has attendance recorded for this window.' };
    return { success: false, error: error.message };
  }

  return { success: true, data: undefined, message: 'Attendance record created manually.' };
}
