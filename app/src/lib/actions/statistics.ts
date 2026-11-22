'use server';

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

// Server actions are public endpoints, so a student session must not reach organization-wide statistics.
async function getStaffContext() {
  const context = await getRouteRequestContext();
  return context && context.user.role !== 'student' ? context : null;
}

export async function getStatisticsOverviewAction(): Promise<ActionResponse<StatisticsOverviewData>> {
  const context = await getStaffContext();
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
  const context = await getStaffContext();
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
