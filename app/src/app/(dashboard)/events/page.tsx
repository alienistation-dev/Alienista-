import React, { Suspense } from 'react';
import { getEventsAction } from '@/lib/actions/events';
import { getSessionUser } from '@/lib/session';
import { RouteSkeleton } from '@/components/layout/route-skeleton';
import { EventsView } from './events-view';

async function DeferredEvents({
  eventsPromise,
  userPromise,
}: {
  eventsPromise: ReturnType<typeof getEventsAction>;
  userPromise: ReturnType<typeof getSessionUser>;
}) {
  const [res, user] = await Promise.all([eventsPromise, userPromise]);

  if (!res.success) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        Failed to load events: {res.error}
      </div>
    );
  }

  return <EventsView initialEvents={res.data} userRole={user?.role || 'officer'} />;
}

export default function EventsPage() {
  const userPromise = getSessionUser();
  const eventsPromise = getEventsAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Events Management</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Schedule events, configure attendance windows, and review event status.
        </p>
      </div>
      <Suspense fallback={<RouteSkeleton rows={5} />}>
        <DeferredEvents eventsPromise={eventsPromise} userPromise={userPromise} />
      </Suspense>
    </div>
  );
}
