'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { offlineDB, DeviceScanLog } from '@/lib/offline-db';
import { Smartphone, Download, Trash2 } from 'lucide-react';

export function DeviceLogView({ organizationId }: { organizationId: string }) {
  const [logs, setLogs] = useState<DeviceScanLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    try {
      const data = await offlineDB.getDeviceScanHistory(organizationId);
      setLogs(data);
    } catch {
      // IndexedDB error
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void Promise.resolve().then(loadLogs);
  }, [loadLogs]);

  const handleClear = async () => {
    if (!confirm('Clear local on-device scan audit history? This action cannot be undone.')) return;
    await offlineDB.clearDeviceScanHistory(organizationId);
    setLogs([]);
  };

  const handleExportCsv = () => {
    const headers = ['Client_ID', 'Student_UID', 'Student_Name', 'Event_Name', 'Officer', 'Timestamp', 'Status'];
    const rows = logs.map((l) => [
      `"${l.client_id}"`,
      `"${l.student_uid}"`,
      `"${l.student_name}"`,
      `"${l.event_name}"`,
      `"${l.officer}"`,
      `"${l.timestamp}"`,
      `"${l.sync_status}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `device_scan_audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-border rounded-2xl p-4 shadow-xs">
        <div>
          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" />
            <span>Local Device Audit Trail</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Permanent hardware record of all scans taken on this browser ({logs.length} logged).
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={handleExportCsv}
            disabled={logs.length === 0}
            className="px-3.5 py-1.5 bg-muted border border-border hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleClear}
            disabled={logs.length === 0}
            className="px-3.5 py-1.5 bg-red-50 border border-red-200 hover:bg-red-100 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-1.5 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Log</span>
          </button>
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-white border border-border rounded-3xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted text-slate-600 border-b border-border">
            <tr>
              <th className="py-3.5 px-4 font-bold uppercase text-xs text-primary">Student UID</th>
              <th className="py-3.5 px-4 font-bold uppercase text-xs">Name</th>
              <th className="py-3.5 px-4 font-bold uppercase text-xs">Event</th>
              <th className="py-3.5 px-4 font-bold uppercase text-xs">Officer</th>
              <th className="py-3.5 px-4 font-bold uppercase text-xs">Time</th>
              <th className="py-3.5 px-4 font-bold uppercase text-xs text-right">Sync Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  Loading on-device log...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No local scan audit records found on this device.
                </td>
              </tr>
            ) : (
              logs.map((l, i) => {
                const dt = new Date(l.timestamp);
                const timeStr = `${dt.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

                return (
                  <tr key={i} className="hover:bg-muted">
                    <td className="py-3 px-4 font-mono font-bold text-primary">{l.student_uid}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{l.student_name}</td>
                    <td className="py-3 px-4 text-slate-600">{l.event_name}</td>
                    <td className="py-3 px-4 text-slate-600">{l.officer}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{timeStr}</td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          l.sync_status === 'synced'
                            ? 'bg-secondary text-secondary-foreground border border-primary/25'
                            : l.sync_status === 'pending_offline'
                            ? 'bg-sky-50 text-sky-800 border border-sky-200'
                            : l.sync_status === 'duplicate'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {l.sync_status === 'synced'
                          ? 'Synced'
                          : l.sync_status === 'pending_offline'
                          ? 'Saved Offline'
                          : l.sync_status === 'duplicate'
                          ? 'Already Scanned'
                          : 'Invalid / Error'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
