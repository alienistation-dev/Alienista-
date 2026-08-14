'use server';

import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse } from '@/lib/types/actions';
import { DashboardStats, Event } from '@/lib/types/models';

export async function getDashboardDataAction(): Promise<ActionResponse<{
  stats: DashboardStats;
  events: Event[];
  recentAttendance: any[];
}>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  // 1. Fetch aggregate metrics
  const { data: statsRow } = await admin
    .from('v_dashboard_stats')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  const stats: DashboardStats = {
    total_students: Number(statsRow?.total_students || 0),
    active_students: Number(statsRow?.active_students || 0),
    total_events: Number(statsRow?.total_events || 0),
    open_events: Number(statsRow?.open_events || 0),
    total_attendance: Number(statsRow?.total_attendance || 0),
    overall_attendance_pct: Number(statsRow?.overall_attendance_pct || 0),
  };

  // 2. Fetch events
  const { data: events } = await admin
    .from('events')
    .select('*')
    .eq('organization_id', orgId)
    .order('starts_at', { ascending: false });

  // 3. Fetch recent attendance
  const { data: recentAttendance } = await admin
    .from('v_attendance_details')
    .select('*')
    .eq('organization_id', orgId)
    .order('recorded_at', { ascending: false })
    .limit(10);

  return {
    success: true,
    data: {
      stats,
      events: (events as Event[]) || [],
      recentAttendance: recentAttendance || [],
    },
  };
}
