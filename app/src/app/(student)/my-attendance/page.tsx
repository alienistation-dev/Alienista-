import React from 'react';
import { getSessionUser } from '@/lib/session';
import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Calendar, Clock, CheckCircle2 } from 'lucide-react';

interface AttendanceDetailRow {
  id: string;
  event_name: string;
  recorded_at: string;
  officer_name: string | null;
}

export default async function MyAttendancePage() {
  const user = await getSessionUser();
  if (!user || user.role !== 'student') redirect('/login');

  const admin = createAdminClient();
  const orgId = await getEffectiveOrgId(user.organization_id);

  const [{ data: attendance }, { data: events }] = await Promise.all([
    admin
      .from('v_attendance_details')
      .select('*')
      .eq('organization_id', orgId)
      .eq('student_uid', user.uid)
      .order('recorded_at', { ascending: false }),
    admin
      .from('events')
      .select('id')
      .eq('organization_id', orgId),
  ]);

  // One row per slot scan, so count distinct events (same rule as v_statistics_student_summary).
  const totalEvents = events?.length || 0;
  const attendedCount = new Set((attendance || []).map((row: { event_id: string }) => row.event_id)).size;
  const pct = totalEvents === 0 ? 0 : Math.round((attendedCount / totalEvents) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-primary tracking-tight">Attendance Record</h1>
        <p className="text-xs text-slate-500 mt-1">Official verified attendance logs for your account.</p>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-5 bg-white border border-border rounded-3xl shadow-xs">
          <span className="text-xs text-slate-500 uppercase font-bold block mb-1">Attended</span>
          <span className="text-2xl font-extrabold text-primary">{attendedCount}</span>
          <span className="text-xs text-slate-400 font-medium block mt-0.5">out of {totalEvents} {totalEvents === 1 ? 'event' : 'events'}</span>
        </div>
        <div className="p-5 bg-white border border-border rounded-3xl shadow-xs">
          <span className="text-xs text-slate-500 uppercase font-bold block mb-1">Rate</span>
          <span className="text-2xl font-extrabold text-primary">{pct}%</span>
          <span className="text-xs text-slate-400 font-medium block mt-0.5">membership turnout</span>
        </div>
      </div>

      {/* History Log */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Attendance Logs</h3>
        {(!attendance || attendance.length === 0) ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-white border border-border rounded-3xl">
            No attendance recorded for your account yet.
          </div>
        ) : (
          (attendance as AttendanceDetailRow[]).map((item) => {
            const dt = new Date(item.recorded_at);
            const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={item.id}
                className="p-4 bg-white border border-border rounded-2xl flex items-center justify-between shadow-xs"
              >
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-900">{item.event_name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-primary" /> {dateStr}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-primary" /> {timeStr}
                    </span>
                  </div>
                  {item.officer_name && (
                    <div className="text-xs text-slate-400">Scanned by: {item.officer_name}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-secondary text-secondary-foreground border border-primary/25">
                    <CheckCircle2 className="w-3 h-3" />
                    Present
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
