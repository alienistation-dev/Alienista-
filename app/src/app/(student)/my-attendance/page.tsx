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

  const { data: attendance } = await admin
    .from('v_attendance_details')
    .select('*')
    .eq('student_uid', user.uid)
    .order('recorded_at', { ascending: false });

  const { data: events } = await admin
    .from('events')
    .select('id')
    .eq('organization_id', orgId);

  const totalEvents = Math.max(1, events?.length || 1);
  const attendedCount = attendance?.length || 0;
  const pct = Math.round((attendedCount / totalEvents) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-[#1B4332] tracking-tight">Attendance Record</h1>
        <p className="text-xs text-slate-500 mt-1">Official verified attendance logs for your account.</p>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-5 bg-white border border-[#E5EBE5] rounded-3xl shadow-xs">
          <span className="text-[11px] text-slate-500 uppercase font-bold block mb-1">Attended</span>
          <span className="text-2xl font-extrabold text-[#1B4332]">{attendedCount}</span>
          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">out of {totalEvents} events</span>
        </div>
        <div className="p-5 bg-white border border-[#E5EBE5] rounded-3xl shadow-xs">
          <span className="text-[11px] text-slate-500 uppercase font-bold block mb-1">Rate</span>
          <span className="text-2xl font-extrabold text-[#D4AF37]">{pct}%</span>
          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">membership turnout</span>
        </div>
      </div>

      {/* History Log */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Attendance Logs</h3>
        {(!attendance || attendance.length === 0) ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-white border border-[#E5EBE5] rounded-3xl">
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
                className="p-4 bg-white border border-[#E5EBE5] rounded-2xl flex items-center justify-between shadow-xs"
              >
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-900">{item.event_name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-[#2D6A4F]" /> {dateStr}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#2D6A4F]" /> {timeStr}
                    </span>
                  </div>
                  {item.officer_name && (
                    <div className="text-[11px] text-slate-400">Scanned by: {item.officer_name}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF5EE] text-[#1B4332] border border-[#C2E0CC]">
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
