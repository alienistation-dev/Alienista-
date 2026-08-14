import React from 'react';
import { getDashboardDataAction } from '@/lib/actions/dashboard';
import { DonutChart } from '@/components/charts/donut-chart';
import { Users, Calendar, QrCode, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';

export default async function DashboardPage() {
  const res = await getDashboardDataAction();
  if (!res.success) {
    return (
      <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-red-700">
        <h2 className="text-lg font-bold mb-2">Unable to load dashboard</h2>
        <p className="text-sm">{res.error}</p>
      </div>
    );
  }

  const { stats, recentAttendance } = res.data;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1B4332] tracking-tight">Executive Overview</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">Real-time attendance metrics and member activity feed.</p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-[#E5EBE5] rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-xs">
          <div className="w-1.5 h-full bg-[#2D6A4F] absolute left-0 top-0"></div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider">Total Students</span>
            <Users className="w-4 h-4 text-[#2D6A4F]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{stats.total_students}</div>
          <div className="text-[11px] text-slate-500 font-medium mt-1">{stats.active_students} active enrolled</div>
        </div>

        <div className="bg-white border border-[#E5EBE5] rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-xs">
          <div className="w-1.5 h-full bg-[#D4AF37] absolute left-0 top-0"></div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider">Events</span>
            <Calendar className="w-4 h-4 text-[#B8860B]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{stats.total_events}</div>
          <div className="text-[11px] text-slate-500 font-medium mt-1">{stats.open_events} currently open</div>
        </div>

        <div className="bg-white border border-[#E5EBE5] rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-xs">
          <div className="w-1.5 h-full bg-sky-600 absolute left-0 top-0"></div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider">Attendance</span>
            <QrCode className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{stats.total_attendance}</div>
          <div className="text-[11px] text-slate-500 font-medium mt-1">Total recorded scans</div>
        </div>

        <div className="bg-white border border-[#E5EBE5] rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-xs">
          <div className="w-1.5 h-full bg-emerald-600 absolute left-0 top-0"></div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider">Turnout Rate</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{stats.overall_attendance_pct}%</div>
          <div className="text-[11px] text-slate-500 font-medium mt-1">Average turnout rate</div>
        </div>
      </div>

      {/* Snapshot & Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Overall Snapshot */}
        <div className="bg-white border border-[#E5EBE5] rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Event Turnout Snapshot</h3>
            <p className="text-xs text-slate-500 mb-6">Overall turnout proportion across enrolled members.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-4">
            <DonutChart present={stats.total_attendance} total={Math.max(stats.active_students * stats.total_events, 1)} />
            <div className="space-y-2.5 text-xs w-full sm:w-auto">
              <div className="flex items-center justify-between sm:justify-start gap-4 p-3 rounded-xl bg-[#F8FAF9] border border-[#E5EBE5]">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#2D6A4F]"></span>
                  <span className="text-slate-700 font-medium">Total Attendance Scans</span>
                </div>
                <b className="text-slate-900 font-mono font-bold">{stats.total_attendance}</b>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4 p-3 rounded-xl bg-[#F8FAF9] border border-[#E5EBE5]">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-slate-400"></span>
                  <span className="text-slate-700 font-medium">Active Enrolled Students</span>
                </div>
                <b className="text-slate-900 font-mono font-bold">{stats.active_students}</b>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Recent Scans */}
        <div className="bg-white border border-[#E5EBE5] rounded-2xl p-5 sm:p-6 flex flex-col shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center justify-between">
            <span>Recent Activity</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </h3>
          <div className="space-y-2.5 flex-1">
            {recentAttendance.length === 0 ? (
              <div className="text-xs text-slate-400 py-12 text-center">No attendance scans recorded yet.</div>
            ) : (
              recentAttendance.slice(0, 5).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAF9] border border-[#E5EBE5] text-xs">
                  <div>
                    <div className="font-bold text-slate-900">{item.student_name}</div>
                    <div className="text-[11px] text-slate-500 font-medium">{item.event_name}</div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-[#2D6A4F] font-bold">
                      <CheckCircle2 className="w-3 h-3" />
                      Present
                    </span>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {new Date(item.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
