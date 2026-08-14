'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';

export interface StatisticsData {
  attendanceLogs: any[];
  byEventPct: Array<{ label: string; count: number; pct: number }>;
  officerLogs: Record<string, number>;
  studentsStats: Array<{ uid: string; name: string; year: string; attendance_pct: number; count: number }>;
}

export async function getStatisticsAction(): Promise<ActionResponse<StatisticsData>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createAdminClient();

  // 1. All Attendance Records
  const { data: logs } = await admin
    .from('v_attendance_details')
    .select('*')
    .eq('organization_id', user.organization_id)
    .order('recorded_at', { ascending: false });

  // 2. All Events
  const { data: events } = await admin
    .from('events')
    .select('id, name')
    .eq('organization_id', user.organization_id);

  // 3. Active Students
  const { data: students } = await admin
    .from('students')
    .select('id, uid, full_name, year, status')
    .eq('organization_id', user.organization_id)
    .eq('status', 'Active');

  const totalActive = students?.length || 1;
  const attendanceList = logs || [];

  // Attendance by event
  const byEventPct = (events || []).map((e) => {
    const eventScans = attendanceList.filter((a: any) => a.event_id === e.id).length;
    return {
      label: e.name,
      count: eventScans,
      pct: Math.round((eventScans / totalActive) * 100),
    };
  });

  // Officer scans
  const officerLogs: Record<string, number> = {};
  attendanceList.forEach((a: any) => {
    const off = a.officer_name || 'Officer';
    officerLogs[off] = (officerLogs[off] || 0) + 1;
  });

  // Student percentages
  const totalEventsCount = Math.max(1, events?.length || 1);
  const studentsStats = (students || []).map((st) => {
    const stScans = attendanceList.filter((a: any) => a.student_uid === st.uid).length;
    return {
      uid: st.uid,
      name: st.full_name,
      year: st.year,
      count: stScans,
      attendance_pct: Math.round((stScans / totalEventsCount) * 100),
    };
  });

  return {
    success: true,
    data: {
      attendanceLogs: attendanceList,
      byEventPct,
      officerLogs,
      studentsStats,
    },
  };
}
