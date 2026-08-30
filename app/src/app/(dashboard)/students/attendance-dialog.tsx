'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  deleteAttendanceRecordAction,
  getStudentAttendanceDetailsAction,
  updateAttendanceRecordAction,
} from '@/lib/actions/attendance-admin';
import type { AttendanceRecordDetail, AttendanceStatus, Student, StudentAttendanceDetails } from '@/lib/types/models';
import { AlertTriangle, Check, History, Pencil, Trash2, X } from 'lucide-react';

interface AttendanceDialogProps {
  student: Student | null;
  onClose: () => void;
}

interface EditState {
  slot_id: string | null;
  effective_scan_time: string;
  attendance_status: AttendanceStatus;
  late_penalty_percent: number;
  earned_points_override: string;
  reason: string;
}

function toLocalDateTime(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function slotMaximum(record: AttendanceRecordDetail) {
  const requiredSlots = record.event.slots.filter((slot) => slot.is_required);
  return Number(record.event.weight) / Math.max(requiredSlots.length, 1);
}

function normalEarnedPoints(record: AttendanceRecordDetail, state: EditState) {
  const maximum = slotMaximum(record);
  return state.attendance_status === 'late'
    ? maximum * (1 - state.late_penalty_percent / 100)
    : maximum;
}

function editStateFor(record: AttendanceRecordDetail): EditState {
  return {
    slot_id: record.slot_id,
    effective_scan_time: toLocalDateTime(record.effective_scan_time),
    attendance_status: record.attendance_status,
    late_penalty_percent: Number(record.late_penalty_percent),
    earned_points_override: record.earned_points_override === null ? '' : String(record.earned_points_override),
    reason: '',
  };
}

function AttendanceDialogContent({ student, onClose }: { student: Student; onClose: () => void }) {
  const [details, setDetails] = useState<StudentAttendanceDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ record: AttendanceRecordDetail; state: EditState } | null>(null);
  const [deleting, setDeleting] = useState<AttendanceRecordDetail | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isPending, startTransition] = useTransition();

  const loadDetails = useCallback(async () => {
    const result = await getStudentAttendanceDetailsAction(student.id);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError(null);
    setDetails(result.data);
  }, [student.id]);

  useEffect(() => {
    let active = true;
    void getStudentAttendanceDetailsAction(student.id).then((result) => {
      if (!active) return;
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDetails(result.data);
    });
    return () => {
      active = false;
    };
  }, [student.id]);

  const correctionsByRecord = useMemo(() => {
    const grouped = new Map<string, StudentAttendanceDetails['corrections']>();
    for (const correction of details?.corrections || []) {
      const records = grouped.get(correction.attendance_record_id) || [];
      records.push(correction);
      grouped.set(correction.attendance_record_id, records);
    }
    return grouped;
  }, [details]);

  const handleSave = () => {
    if (!editing) return;
    const effectiveScanTime = new Date(editing.state.effective_scan_time);
    if (!Number.isFinite(effectiveScanTime.getTime())) {
      setError('Enter a valid effective scan time.');
      return;
    }
    startTransition(async () => {
      const result = await updateAttendanceRecordAction({
        record_id: editing.record.id,
        slot_id: editing.state.slot_id,
        effective_scan_time: effectiveScanTime.toISOString(),
        attendance_status: editing.state.attendance_status,
        late_penalty_percent: Number(editing.state.late_penalty_percent),
        earned_points_override: editing.state.earned_points_override === ''
          ? null
          : Number(editing.state.earned_points_override),
        reason: editing.state.reason,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEditing(null);
      await loadDetails();
    });
  };

  const handleDelete = () => {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteAttendanceRecordAction({ record_id: deleting.id, reason: deleteReason });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDeleting(null);
      setDeleteReason('');
      await loadDetails();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-xs sm:p-5">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-foreground">Attendance: {student.full_name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{student.student_number}</p>
          </div>
          <button type="button" onClick={onClose} title="Close attendance details" className="rounded-lg p-2 text-muted-foreground hover:bg-slate-100 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
          {!details && !error && <div className="py-12 text-center text-sm text-muted-foreground">Loading attendance records...</div>}

          {details && details.records.length === 0 && (
            <div className="rounded-lg border border-border bg-slate-50 p-8 text-center text-sm text-muted-foreground">
              No attendance records found for this student.
            </div>
          )}

          {details?.records.map((record) => {
            const recordHistory = correctionsByRecord.get(record.id) || [];
            const isEditing = editing?.record.id === record.id;
            const maximum = slotMaximum(record);
            return (
              <section key={record.id} className="rounded-lg border border-border bg-white">
                <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{record.event.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {record.slot?.label || 'Event attendance'} · {new Date(record.effective_scan_time).toLocaleString()}
                    </p>
                  </div>
                  {!isEditing && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setEditing({ record, state: editStateFor(record) })} title="Correct attendance record" className="rounded-lg p-2 text-[#2D6A4F] hover:bg-[#EBF5EE]">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => { setDeleting(record); setDeleteReason(''); }} title="Delete attendance record" className="rounded-lg p-2 text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing && editing ? (
                  <div className="grid gap-4 p-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-slate-700">
                        Slot
                        <select value={editing.state.slot_id || ''} onChange={(event) => setEditing({ ...editing, state: { ...editing.state, slot_id: event.target.value || null } })} className="mt-1 w-full rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs text-foreground">
                          <option value="">Event attendance</option>
                          {record.event.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
                        </select>
                      </label>
                      <label className="block text-xs font-semibold text-slate-700">
                        Effective scan time
                        <input type="datetime-local" required value={editing.state.effective_scan_time} onChange={(event) => setEditing({ ...editing, state: { ...editing.state, effective_scan_time: event.target.value } })} className="mt-1 w-full rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs text-foreground" />
                      </label>
                      <label className="block text-xs font-semibold text-slate-700">
                        Status
                        <select value={editing.state.attendance_status} onChange={(event) => setEditing({ ...editing, state: { ...editing.state, attendance_status: event.target.value as AttendanceStatus } })} className="mt-1 w-full rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs text-foreground">
                          <option value="on_time">On time</option>
                          <option value="late">Late</option>
                          <option value="manual">Manual</option>
                        </select>
                      </label>
                    </div>
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-slate-700">
                        Late penalty (%)
                        <input type="number" min="0" max="100" step="1" value={editing.state.late_penalty_percent} onChange={(event) => setEditing({ ...editing, state: { ...editing.state, late_penalty_percent: Number(event.target.value) } })} className="mt-1 w-full rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs text-foreground" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-border bg-slate-50 p-3">
                          <span className="block text-[10px] font-bold uppercase text-muted-foreground">Normal points</span>
                          <strong className="mt-1 block text-sm text-foreground">{normalEarnedPoints(record, editing.state).toFixed(2)} / {maximum.toFixed(2)}</strong>
                        </div>
                        <label className="rounded-lg border border-border bg-slate-50 p-3 text-[10px] font-bold uppercase text-muted-foreground">
                          Awarded override
                          <input type="number" min="0" max={maximum} step="0.01" placeholder="None" value={editing.state.earned_points_override} onChange={(event) => setEditing({ ...editing, state: { ...editing.state, earned_points_override: event.target.value } })} className="mt-1 w-full border-0 bg-transparent p-0 text-sm font-bold text-foreground outline-none" />
                        </label>
                      </div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Correction reason
                        <textarea required rows={2} value={editing.state.reason} onChange={(event) => setEditing({ ...editing, state: { ...editing.state, reason: event.target.value } })} className="mt-1 w-full resize-none rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs text-foreground" />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2 lg:col-span-2">
                      <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-slate-100">Cancel</button>
                      <button type="button" disabled={isPending} onClick={handleSave} className="inline-flex items-center gap-1.5 rounded-lg bg-[#2D6A4F] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                        <Check className="h-3.5 w-3.5" /> Save correction
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 p-4 text-xs sm:grid-cols-4">
                    <div><span className="block text-[10px] font-bold uppercase text-muted-foreground">Status</span><strong className="mt-1 block text-foreground">{record.attendance_status.replace('_', ' ')}</strong></div>
                    <div><span className="block text-[10px] font-bold uppercase text-muted-foreground">Penalty</span><strong className="mt-1 block text-foreground">{Number(record.late_penalty_percent)}%</strong></div>
                    <div><span className="block text-[10px] font-bold uppercase text-muted-foreground">Normal points</span><strong className="mt-1 block text-foreground">{(record.attendance_status === 'late' ? maximum * (1 - Number(record.late_penalty_percent) / 100) : maximum).toFixed(2)}</strong></div>
                    <div><span className="block text-[10px] font-bold uppercase text-muted-foreground">Awarded points</span><strong className="mt-1 block text-foreground">{record.earned_points_override === null ? 'Normal calculation' : Number(record.earned_points_override).toFixed(2)}</strong></div>
                  </div>
                )}

                {recordHistory.length > 0 && (
                  <div className="border-t border-border bg-slate-50 px-4 py-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground"><History className="h-3.5 w-3.5" /> Correction history</div>
                    <div className="space-y-2">
                      {recordHistory.map((correction) => (
                        <div key={correction.id} className="flex flex-col justify-between gap-1 text-xs sm:flex-row">
                          <span className="font-semibold text-slate-700">{correction.reason}</span>
                          <span className="text-muted-foreground">{new Date(correction.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          {details && details.corrections.some((correction) => correction.action === 'delete') && (
            <section className="rounded-lg border border-border bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground"><History className="h-4 w-4" /> Deleted record history</div>
              <div className="space-y-2">
                {details.corrections.filter((correction) => correction.action === 'delete').map((correction) => (
                  <div key={correction.id} className="flex flex-col justify-between gap-1 border-b border-border pb-2 text-xs last:border-0 last:pb-0 sm:flex-row">
                    <span className="font-semibold text-slate-700">{correction.reason}</span>
                    <span className="text-muted-foreground">{new Date(correction.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {deleting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-sm font-bold text-red-700"><AlertTriangle className="h-4 w-4" /> Delete attendance record?</div>
            <p className="text-xs text-muted-foreground">{deleting.event.name} · {deleting.slot?.label || 'Event attendance'}</p>
            <label className="block text-xs font-semibold text-slate-700">Deletion reason<textarea rows={3} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} className="mt-1 w-full resize-none rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs text-foreground" /></label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-slate-100">Cancel</button>
              <button type="button" disabled={isPending} onClick={handleDelete} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Delete record</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AttendanceDialog({ student, onClose }: AttendanceDialogProps) {
  if (!student) return null;
  return <AttendanceDialogContent key={student.id} student={student} onClose={onClose} />;
}
