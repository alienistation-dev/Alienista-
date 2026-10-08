import React, { Suspense } from 'react';
import { getStudentsAction } from '@/lib/actions/students';
import { getSessionUser } from '@/lib/session';
import { RouteSkeleton } from '@/components/layout/route-skeleton';
import { StudentTable } from './student-table';

async function DeferredStudents({
  studentsPromise,
  userPromise,
}: {
  studentsPromise: ReturnType<typeof getStudentsAction>;
  userPromise: ReturnType<typeof getSessionUser>;
}) {
  const [res, user] = await Promise.all([studentsPromise, userPromise]);

  if (!res.success) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        Failed to load students: {res.error}
      </div>
    );
  }

  return <StudentTable initialPage={res.data} userRole={user?.role || 'officer'} />;
}

export default function StudentsPage() {
  const userPromise = getSessionUser();
  const studentsPromise = getStudentsAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Student Directory</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Manage the organization roster, student credentials, and badge photos.
        </p>
      </div>
      <Suspense fallback={<RouteSkeleton rows={8} />}>
        <DeferredStudents studentsPromise={studentsPromise} userPromise={userPromise} />
      </Suspense>
    </div>
  );
}
