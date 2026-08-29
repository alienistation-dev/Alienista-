'use server';

import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';
import { requireRole } from '@/lib/auth/guards';
import { evaluateAttendanceStatus } from '@/lib/attendance/status';
import { AttendanceStatus } from '@/lib/types/models';

interface AttendanceSlotRow {
  id: string;
  opens_at: string;
  closes_at: string;
  late_cutoff_at: string | null;
  late_penalty_percent: number;
}

interface ScanInput {
  student_uid: string;
  event_id: string;
  slot_id?: string | null;
  client_id?: string;
  timestamp?: string;
}

interface RecordedScan {
  student_name: string;
  event_name: string;
  timestamp: string;
  attendance_status: AttendanceStatus;
  late_penalty_percent: number;
}

interface BulkScanInput extends ScanInput {
  client_id: string;
}

interface SyncScanResult {
  client_id: string;
  success: boolean;
  error?: string;
  code?: string;
  data?: RecordedScan;
}

export async function recordScanAction(input: ScanInput): Promise<ActionResponse<RecordedScan>> {
  let user;
  try {
    user = await requireRole('admin', 'officer');
  } catch {
    return { success: false, error: 'Unauthorized.' };
  }

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();
  const scanTime = input.timestamp ? new Date(input.timestamp) : new Date();
  if (!Number.isFinite(scanTime.getTime())) return { success: false, error: 'Invalid scan timestamp.', code: 'INVALID_TIMESTAMP' };

  // 1. Resolve student
  const { data: student } = await admin
    .from('students')
    .select('id, full_name, status')
    .eq('uid', input.student_uid.trim())
    .eq('organization_id', orgId)
    .single();

  if (!student) return { success: false, error: 'Student UID not found.', code: 'STUDENT_NOT_FOUND' };
  if (student.status !== 'Active') return { success: false, error: 'Student account is inactive.', code: 'STUDENT_INACTIVE' };

  // 2. Resolve event & slots
  const { data: event } = await admin
    .from('events')
    .select('id, name, status, slots:event_slots(*)')
    .eq('id', input.event_id)
    .eq('organization_id', orgId)
    .single();

  if (!event) return { success: false, error: 'Event not found.', code: 'EVENT_NOT_FOUND' };
  if (event.status !== 'Open') return { success: false, error: 'Event is closed for attendance.', code: 'EVENT_CLOSED' };

  // 3. Validate slot window if event has slots
  let activeSlotId = input.slot_id || null;
  let attendanceStatus: AttendanceStatus = 'on_time';
  let effectiveScanTime = scanTime.toISOString();
  let latePenaltyPercent = 0;
  if (event.slots && event.slots.length > 0) {
    const slots = event.slots as AttendanceSlotRow[];
    const validSlot = slots.find((slot) => {
      if (input.slot_id && slot.id !== input.slot_id) return false;
      const open = new Date(slot.opens_at);
      const close = new Date(slot.closes_at);
      return scanTime >= open && scanTime <= close;
    });

    if (!validSlot) {
      return { success: false, error: 'Scan rejected: Outside active attendance window.', code: 'OUTSIDE_WINDOW' };
    }
    activeSlotId = validSlot.id;
    const evaluation = evaluateAttendanceStatus(scanTime, validSlot);
    attendanceStatus = evaluation.status;
    effectiveScanTime = evaluation.effective_scan_time;
    latePenaltyPercent = evaluation.late_penalty_percent;
  }

  // 4. Duplicate Check
  let query = admin
    .from('attendance_records')
    .select('id')
    .eq('student_id', student.id)
    .eq('event_id', event.id);

  if (activeSlotId) {
    query = query.eq('slot_id', activeSlotId);
  } else {
    query = query.is('slot_id', null);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    return { success: false, error: 'Already scanned for this session.', code: 'DUPLICATE' };
  }

  // 5. Insert Attendance
  const { error: insertErr } = await admin.from('attendance_records').insert({
    organization_id: orgId,
    student_id: student.id,
    event_id: event.id,
    slot_id: activeSlotId,
    officer_id: user.role === 'officer' ? user.id : null,
    officer_name: user.name,
    client_id: input.client_id || null,
    recorded_at: scanTime.toISOString(),
    effective_scan_time: effectiveScanTime,
    attendance_status: attendanceStatus,
    late_penalty_percent: latePenaltyPercent,
  });

  if (insertErr) {
    if (insertErr.code === '23505') {
      return { success: false, error: 'Already recorded.', code: 'DUPLICATE' };
    }
    return { success: false, error: insertErr.message, code: 'SERVER_ERROR' };
  }

  return {
    success: true,
    data: {
      student_name: student.full_name,
      event_name: event.name,
      timestamp: effectiveScanTime,
      attendance_status: attendanceStatus,
      late_penalty_percent: latePenaltyPercent,
    },
  };
}

export async function bulkSyncScansAction(scans: BulkScanInput[]): Promise<ActionResponse<SyncScanResult[]>> {
  // Auth guard at the bulk entry point — defence-in-depth
  try {
    await requireRole('admin', 'officer');
  } catch {
    return { success: false, error: 'Unauthorized.' };
  }

  const BATCH_SIZE = 10;
  const results: SyncScanResult[] = [];

  for (let i = 0; i < scans.length; i += BATCH_SIZE) {
    const batch = scans.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (scan) => {
        const res = await recordScanAction(scan);
        return {
          client_id: scan.client_id,
          success: res.success,
          error: !res.success ? res.error : undefined,
          code: !res.success ? res.code : undefined,
          data: res.success ? res.data : undefined,
        };
      })
    );
    results.push(...batchResults);
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

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  // Validate that student belongs to this org
  const { data: student } = await admin
    .from('students')
    .select('id')
    .eq('id', input.student_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!student) return { success: false, error: 'Student not found in this organization.' };

  // Validate that event belongs to this org
  const { data: event } = await admin
    .from('events')
    .select('id')
    .eq('id', input.event_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!event) return { success: false, error: 'Event not found in this organization.' };

  const { error } = await admin.from('attendance_records').insert({
    organization_id: orgId,
    student_id: input.student_id,
    event_id: input.event_id,
    slot_id: input.slot_id || null,
    officer_name: 'Admin (Manual Override)',
    effective_scan_time: new Date().toISOString(),
    attendance_status: 'manual',
    late_penalty_percent: 0,
  });

  if (error) {
    if (error.code === '23505') return { success: false, error: 'Student already has attendance recorded for this window.' };
    return { success: false, error: error.message };
  }

  return { success: true, data: undefined, message: 'Attendance record created manually.' };
}
