'use server';

import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse, SessionUser } from '@/lib/types/actions';
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
  officer_id?: string | null;
}

// Replayed capture times are client clocks: allow small skew, refuse stale or future scans.
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
const MAX_REPLAY_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // Live scans are timed and attributed by the server; client timestamp/officer fields are ignored.
  return recordScan(user, input, false);
}

async function recordScan(
  user: SessionUser,
  input: ScanInput & { officer_id?: string | null },
  replay: boolean
): Promise<ActionResponse<RecordedScan>> {
  const now = new Date();
  let scanTime = now;
  if (replay) {
    scanTime = new Date(input.timestamp ?? '');
    const ageMs = now.getTime() - scanTime.getTime();
    if (!Number.isFinite(ageMs)) return { success: false, error: 'Invalid scan timestamp.', code: 'INVALID_TIMESTAMP' };
    if (ageMs < -MAX_CLOCK_SKEW_MS) return { success: false, error: 'Scan timestamp is in the future.', code: 'INVALID_TIMESTAMP' };
    if (ageMs > MAX_REPLAY_AGE_MS) return { success: false, error: 'Scan is too old to sync.', code: 'INVALID_TIMESTAMP' };
  }

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  // Replays keep the capturing officer only if the session's org lists them as Active; else the session user.
  let officerId = user.role === 'officer' ? user.id : null;
  let officerName = user.name;
  if (replay && input.officer_id && input.officer_id !== user.id && UUID_REGEX.test(input.officer_id)) {
    const { data: officer, error: officerErr } = await admin
      .from('officers')
      .select('id, name')
      .eq('id', input.officer_id)
      .eq('organization_id', orgId)
      .eq('status', 'Active')
      .maybeSingle();
    if (officerErr) return { success: false, error: 'Could not look up the scanning officer. Retry shortly.', code: 'SERVER_ERROR' };
    if (officer) {
      officerId = officer.id;
      officerName = officer.name;
    }
  }

  // 1. Resolve student
  // Lookup errors are transient (SERVER_ERROR is retryable); only an empty result means the record is missing.
  const { data: student, error: studentErr } = await admin
    .from('students')
    .select('id, full_name, status')
    .eq('uid', input.student_uid.trim())
    .eq('organization_id', orgId)
    .maybeSingle();

  if (studentErr) return { success: false, error: 'Could not look up the student. Retry shortly.', code: 'SERVER_ERROR' };
  if (!student) return { success: false, error: 'Student UID not found.', code: 'STUDENT_NOT_FOUND' };
  if (student.status !== 'Active') return { success: false, error: 'Student account is inactive.', code: 'STUDENT_INACTIVE' };

  // 2. Resolve event & slots
  const { data: event, error: eventErr } = await admin
    .from('events')
    .select('id, name, status, slots:event_slots(*)')
    .eq('id', input.event_id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (eventErr) return { success: false, error: 'Could not look up the event. Retry shortly.', code: 'SERVER_ERROR' };
  if (!event) return { success: false, error: 'Event not found.', code: 'EVENT_NOT_FOUND' };
  // A replay into a since-closed event is judged by its slot window at capture time below.
  const hasSlots = Boolean(event.slots && event.slots.length > 0);
  if (event.status !== 'Open' && !(replay && hasSlots)) {
    return { success: false, error: 'Event is closed for attendance.', code: 'EVENT_CLOSED' };
  }

  // 3. Validate slot window if event has slots
  let activeSlotId = input.slot_id || null;
  let attendanceStatus: AttendanceStatus = 'on_time';
  let effectiveScanTime = scanTime.toISOString();
  let latePenaltyPercent = 0;
  if (hasSlots) {
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

  const { data: existing, error: existingErr } = await query.maybeSingle();

  if (existingErr) return { success: false, error: 'Could not check for duplicates. Retry shortly.', code: 'SERVER_ERROR' };
  if (existing) {
    return { success: false, error: 'Already scanned for this session.', code: 'DUPLICATE' };
  }

  // 5. Insert Attendance
  const { error: insertErr } = await admin.from('attendance_records').insert({
    organization_id: orgId,
    student_id: student.id,
    event_id: event.id,
    slot_id: activeSlotId,
    officer_id: officerId,
    officer_name: officerName,
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
  let user;
  try {
    user = await requireRole('admin', 'officer');
  } catch {
    return { success: false, error: 'Unauthorized.' };
  }

  const BATCH_SIZE = 10;
  const results: SyncScanResult[] = [];

  for (let i = 0; i < scans.length; i += BATCH_SIZE) {
    const batch = scans.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (scan) => {
        const res = await recordScan(user, scan, true);
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
