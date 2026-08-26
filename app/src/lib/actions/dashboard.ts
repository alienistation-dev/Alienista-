'use server';

import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';
import { withServerTiming } from '@/lib/server-timing';
import { DashboardStats } from '@/lib/types/models';

export interface RecentAttendanceProjection {
  id: string;
  recorded_at: string;
  student_name: string;
  event_name: string;
}

export async function getDashboardDataAction(): Promise<ActionResponse<{
  stats: DashboardStats;
  recentAttendance: RecentAttendanceProjection[];
}>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  const [{ data: statsRow }, { data: recentAttendance }] = await withServerTiming('dashboard', () => Promise.all([
    admin.from('v_dashboard_stats').select('total_students, active_students, total_events, open_events, total_attendance, overall_attendance_pct').eq('organization_id', orgId).maybeSingle(),
    admin.from('v_attendance_details').select('id, recorded_at, student_name, event_name').eq('organization_id', orgId).order('recorded_at', { ascending: false }).limit(10),
  ]));

  const stats: DashboardStats = {
    total_students: Number(statsRow?.total_students || 0),
    active_students: Number(statsRow?.active_students || 0),
    total_events: Number(statsRow?.total_events || 0),
    open_events: Number(statsRow?.open_events || 0),
    total_attendance: Number(statsRow?.total_attendance || 0),
    overall_attendance_pct: Number(statsRow?.overall_attendance_pct || 0),
  };

  return {
    success: true,
    data: {
      stats,
      recentAttendance: (recentAttendance || []) as RecentAttendanceProjection[],
    },
  };
}
