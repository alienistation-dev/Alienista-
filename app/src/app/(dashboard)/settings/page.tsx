import React, { Suspense } from 'react';
import { getSettingsDataAction } from '@/lib/actions/settings';
import { RouteSkeleton } from '@/components/layout/route-skeleton';
import { SettingsView } from './settings-view';

async function DeferredSettings({ promise }: { promise: ReturnType<typeof getSettingsDataAction> }) {
  const res = await promise;

  if (!res.success) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        Failed to load settings: {res.error}
      </div>
    );
  }

  return <SettingsView initialSettings={res.data.settings} initialOfficers={res.data.officers} initialActivePolicy={res.data.activePolicy} />;
}

export default function SettingsPage() {
  const settingsPromise = getSettingsDataAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">System Settings & Security</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Super-admin configuration, academic semester transitions, and authorized officer management.
        </p>
      </div>
      <Suspense fallback={<RouteSkeleton rows={6} />}>
        <DeferredSettings promise={settingsPromise} />
      </Suspense>
    </div>
  );
}
