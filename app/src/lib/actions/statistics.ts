'use server';

import { createAdminClient, getEffectiveOrgId } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/session';
import { ActionResponse, PageRequest, PaginatedResult } from '@/lib/types/actions';
import { withServerTiming } from '@/lib/server-timing';
import { getRouteRequestContext } from '@/lib/route-context';
import { normalizePageRequest, pageRange } from '@/lib/pagination';

export interface StatisticsOverviewData {
  byEventPct: Array<{ label: string; count: number; pct: number }>;
  officerLogs: Record<string, number>;
}

export type StudentStatistic = { uid: string; name: string; year: string; attendance_pct: number; count: number };
export type StudentStatisticsData = PaginatedResult<StudentStatistic>;

export interface StatisticsData {
  attendanceLogs: Array<{ id: string; organization_id: string; recorded_at: string; student_uid: string; student_name: string; event_id: string; event_name: string; officer_name: string | null }>;
  byEventPct: Array<{ label: string; count: number; pct: number }>;
  officerLogs: Record<string, number>;
  studentsStats: Array<{ uid: string; name: string; year: string; attendance_pct: number; count: number }>;
}

export async function getStatisticsOverviewAction(): Promise<ActionResponse<StatisticsOverviewData>> {
  const context = await getRouteRequestContext();
  if (!context) return { success: false, error: 'Unauthorized' };

  const { admin, organizationId } = context;
  const [{ data: events, error: eventsError }, { data: officerRows, error: officersError }] = await withServerTiming(
    'statistics-overview',
    () => Promise.all([
      withServerTiming('statistics:event-summary', async () => admin
        .from('v_statistics_event_summary')
        .select('event_id, label, count, active_students')
        .eq('organization_id', organizationId)),
      withServerTiming('statistics:officer-summary', async () => admin
        .from('v_statistics_officer_summary')
        .select('officer_name, count')
        .eq('organization_id', organizationId)),
    ])
  );

  if (eventsError) return { success: false, error: eventsError.message };
  if (officersError) return { success: false, error: officersError.message };

  const byEventPct = (events || []).map((event) => {
    const eventScans = Number(event.count || 0);
    return {
      label: event.label,
      count: eventScans,
      pct: Math.round((eventScans / Math.max(1, Number(event.active_students || 0))) * 100),
    };
  });

  const officerLogs: Record<string, number> = Object.fromEntries(
    (officerRows || []).map((row) => [row.officer_name || 'Officer', Number(row.count || 0)])
  );

  return { success: true, data: { byEventPct, officerLogs } };
}

export async function getStudentStatisticsAction(
  input?: Partial<PageRequest>
): Promise<ActionResponse<StudentStatisticsData>> {
  const context = await getRouteRequestContext();
  if (!context) return { success: false, error: 'Unauthorized' };

  const request = normalizePageRequest(input, 25);
  const { from, to } = pageRange(request.page, request.pageSize);
  const { admin, organizationId } = context;
  let query = admin
    .from('v_statistics_student_summary')
    .select('uid, name, year, count, attendance_pct', { count: 'exact' })
    .eq('organization_id', organizationId)
    .order('name', { ascending: true });
  if (request.query) {
    const search = `%${request.query}%`;
    query = query.or(`name.ilike.${search},uid.ilike.${search}`);
  }
  if (request.year) query = query.eq('year', request.year);

  const { data: students, error, count } = await withServerTiming(
    'statistics-student-section',
    async () => withServerTiming('statistics:student-summary', async () => query.range(from, to))
  );

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: {
      items: (students || []).map((student) => ({
        uid: student.uid,
        name: student.name,
        year: student.year,
        count: Number(student.count || 0),
        attendance_pct: Number(student.attendance_pct || 0),
      })),
      total: count || 0,
      page: request.page,
      pageSize: request.pageSize,
    },
  };
}

export async function getStatisticsAction(): Promise<ActionResponse<StatisticsData>> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const orgId = await getEffectiveOrgId(user.organization_id);
  const admin = createAdminClient();

  const [logsResult, eventsResult, studentsResult, officerResult] = await withServerTiming('statistics', () => Promise.all([
    admin.from('v_attendance_details').select('id, organization_id, recorded_at, student_uid, student_name, event_id, event_name, officer_name').eq('organization_id', orgId).order('recorded_at', { ascending: false }).limit(500),
    admin.from('v_statistics_event_summary').select('event_id, label, count, active_students').eq('organization_id', orgId),
    admin.from('v_statistics_student_summary').select('uid, name, year, count, attendance_pct').eq('organization_id', orgId),
    admin.from('v_statistics_officer_summary').select('officer_name, count').eq('organization_id', orgId),
  ]));

  if (logsResult.error) return { success: false, error: logsResult.error.message };
  if (eventsResult.error) return { success: false, error: eventsResult.error.message };
  if (studentsResult.error) return { success: false, error: studentsResult.error.message };
  if (officerResult.error) return { success: false, error: officerResult.error.message };

  const logs = logsResult.data;
  const events = eventsResult.data;
  const students = studentsResult.data;
  const officerRows = officerResult.data;

  const totalActive = students?.length || 1;
  const attendanceList = logs || [];

  // Attendance by event
  const byEventPct = (events || []).map((e) => {
    const eventScans = Number(e.count || 0);
    return {
      label: e.label,
      count: eventScans,
      pct: Math.round((eventScans / Math.max(1, Number(e.active_students || totalActive))) * 100),
    };
  });

  // Officer scans
  const officerLogs: Record<string, number> = Object.fromEntries(
    (officerRows || []).map((row) => [row.officer_name || 'Officer', Number(row.count || 0)])
  );

  // Student percentages
  const studentsStats = (students || []).map((st) => ({
    uid: st.uid,
    name: st.name,
    year: st.year,
    count: Number(st.count || 0),
    attendance_pct: Number(st.attendance_pct || 0),
  }));

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
