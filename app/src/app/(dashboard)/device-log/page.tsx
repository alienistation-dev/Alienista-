import React from 'react';
import { DeviceLogView } from './device-log-view';
import { getSessionUser } from '@/lib/session';

export default async function DeviceLogPage() {
  const user = await getSessionUser();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">On-Device Audit Log</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Browser-persisted scan ledger verifying all offline and online attempts performed on this hardware.
        </p>
      </div>

      <DeviceLogView organizationId={user?.organization_id || ''} />
    </div>
  );
}
