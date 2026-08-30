import React from 'react';
import { getEventsAction } from '@/lib/actions/events';
import { getScannerStudentsAction } from '@/lib/actions/students';
import { getSessionUser } from '@/lib/session';
import { ScannerView } from './scanner-view';

export default async function ScannerPage() {
  const user = await getSessionUser();
  const [eventsRes, studentsRes] = await Promise.all([getEventsAction(), getScannerStudentsAction()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">QR Attendance Scanner</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
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
