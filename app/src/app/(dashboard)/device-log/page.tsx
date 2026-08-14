import React from 'react';
import { DeviceLogView } from './device-log-view';

export default function DeviceLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">On-Device Audit Log</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Browser-persisted scan ledger verifying all offline and online attempts performed on this hardware.
        </p>
      </div>

      <DeviceLogView />
    </div>
  );
}
