import React from 'react';
import { DeviceLogView } from './device-log-view';
import { getSessionUser } from '@/lib/session';

export default async function DeviceLogPage() {
  const user = await getSessionUser();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">On-Device Audit Log</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Browser-persisted scan ledger verifying all offline and online attempts performed on this hardware.
        </p>
      </div>

      <DeviceLogView organizationId={user?.organization_id || ''} />
    </div>
  );
}
