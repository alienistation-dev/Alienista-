import React from 'react';
import { getEventsAction } from '@/lib/actions/events';
import { getSessionUser } from '@/lib/session';
import { EventsView } from './events-view';

export default async function EventsPage() {
  const user = await getSessionUser();
  const res = await getEventsAction();

  if (!res.success) {
    return (
      <div className="p-6 rounded-2xl bg-red-950/40 border border-red-800 text-red-300 text-sm">
        Failed to load events: {res.error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Events Management</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          {user?.role === 'admin'
            ? 'Schedule events, configure time windows (slots), and toggle attendance status.'
            : 'View open events scheduled for attendance.'}
        </p>
      </div>

      <EventsView initialEvents={res.data} userRole={user?.role || 'officer'} />
    </div>
  );
}
