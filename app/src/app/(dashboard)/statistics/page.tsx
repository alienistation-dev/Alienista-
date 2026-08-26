import React, { Suspense } from 'react';
import { getStatisticsOverviewAction, getStudentStatisticsAction, type StudentStatisticsData } from '@/lib/actions/statistics';
import type { ActionResponse } from '@/lib/types/actions';
import { StatisticsOverview } from './statistics-overview';
import { StatisticsOverviewSkeleton } from './statistics-overview-skeleton';
import { StudentStatisticsSection } from './student-statistics-section';
import { StudentStatisticsSkeleton } from './student-statistics-skeleton';

async function DeferredStudentStatistics({ promise }: { promise: Promise<ActionResponse<StudentStatisticsData>> }) {
  const result = await promise;
  if (!result.success) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">Student statistics could not load: {result.error}</div>;
  }
  return <StudentStatisticsSection data={result.data} />;
}

async function DeferredStatisticsOverview({ promise }: { promise: ReturnType<typeof getStatisticsOverviewAction> }) {
  const result = await promise;
  if (!result.success) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">Statistics overview could not load: {result.error}</div>;
  }
  return <StatisticsOverview data={result.data} />;
}

export default function StatisticsPage() {
  const overviewPromise = getStatisticsOverviewAction();
  const studentPromise = getStudentStatisticsAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Analytics & Reports</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Comprehensive attendance analytics, turnout percentages, and officer scan audit metrics.
        </p>
      </div>

      <Suspense fallback={<StatisticsOverviewSkeleton />}>
        <DeferredStatisticsOverview promise={overviewPromise} />
      </Suspense>
      <Suspense fallback={<StudentStatisticsSkeleton />}>
        <DeferredStudentStatistics promise={studentPromise} />
      </Suspense>
    </div>
  );
}
