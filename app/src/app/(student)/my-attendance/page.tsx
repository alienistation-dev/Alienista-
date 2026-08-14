import React from 'react';
import { getSessionUser } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Calendar, Clock, CheckCircle2 } from 'lucide-react';

export default async function MyAttendancePage() {
  const user = await getSessionUser();
  if (!user || user.role !== 'student') redirect('/login');

  const admin = createAdminClient();

  const { data: attendance } = await admin
    .from('v_attendance_details')
    .select('*')
    .eq('student_uid', user.uid)
    .order('recorded_at', { ascending: false });

  const { data: events } = await admin
    .from('events')
    .select('id')
    .eq('organization_id', user.organization_id);

  const totalEvents = Math.max(1, events?.length || 1);
  const attendedCount = attendance?.length || 0;
  const pct = Math.round((attendedCount / totalEvents) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Attendance Record</h1>
        <p className="text-xs text-slate-400 mt-1">Official verified attendance logs for your account.</p>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-[#151E33] border border-slate-800 rounded-2xl">
          <span className="text-[11px] text-slate-400 uppercase font-semibold block mb-1">Attended</span>
          <span className="text-2xl font-bold text-emerald-400">{attendedCount}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">out of {totalEvents} events</span>
        </div>
        <div className="p-4 bg-[#151E33] border border-slate-800 rounded-2xl">
          <span className="text-[11px] text-slate-400 uppercase font-semibold block mb-1">Rate</span>
          <span className="text-2xl font-bold text-amber-400">{pct}%</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">membership turnout</span>
        </div>
      </div>

      {/* History Log */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Attendance Logs</h3>
        {(!attendance || attendance.length === 0) ? (
          <div className="p-8 text-center text-xs text-slate-500 bg-[#151E33] border border-slate-800 rounded-2xl">
            No attendance recorded for your account yet.
          </div>
        ) : (
          attendance.map((item: any) => {
            const dt = new Date(item.recorded_at);
            const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={item.id}
                className="p-4 bg-[#151E33] border border-slate-800 rounded-2xl flex items-center justify-between shadow-sm"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">{item.event_name}</div>
                  <div className="text-xs text-slate-400 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" /> {dateStr}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" /> {timeStr}
                    </span>
                  </div>
                  {item.officer_name && (
                    <div className="text-[11px] text-slate-500">Scanned by: {item.officer_name}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60">
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
