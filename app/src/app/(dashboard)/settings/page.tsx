import React from 'react';
import { getSettingsDataAction } from '@/lib/actions/settings';
import { SettingsView } from './settings-view';

export default async function SettingsPage() {
  const res = await getSettingsDataAction();

  if (!res.success) {
    return (
      <div className="p-6 rounded-2xl bg-red-950/40 border border-red-800 text-red-300 text-sm">
        Failed to load settings: {res.error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">System Settings & Security</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Super-admin configuration, academic semester transitions, and authorized officer management.
        </p>
      </div>

      <SettingsView initialSettings={res.data.settings} initialOfficers={res.data.officers} />
    </div>
  );
}
