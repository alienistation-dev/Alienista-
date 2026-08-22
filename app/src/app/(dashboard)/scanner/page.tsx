import React from 'react';
import { getEventsAction } from '@/lib/actions/events';
import { getStudentsAction } from '@/lib/actions/students';
import { getSessionUser } from '@/lib/session';
import { ScannerView } from './scanner-view';

export default async function ScannerPage() {
  const user = await getSessionUser();
  const [eventsRes, studentsRes] = await Promise.all([getEventsAction(), getStudentsAction()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">QR Attendance Scanner</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Instant real-time attendance verification with offline-first local queueing.
        </p>
      </div>

      <ScannerView
        events={eventsRes.success ? eventsRes.data : []}
        students={studentsRes.success ? studentsRes.data : []}
        userRole={user?.role || 'officer'}
        officerName={user?.name || 'Officer'}
        officerId={user?.id || ''}
        organizationId={user?.organization_id || ''}
      />
    </div>
  );
}
