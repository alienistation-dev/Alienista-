'use client';

import React, { useEffect, useState } from 'react';
import { offlineDB, DeviceScanLog } from '@/lib/offline-db';
import { Smartphone, Download, Trash2, CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react';

export function DeviceLogView() {
  const [logs, setLogs] = useState<DeviceScanLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    try {
      const data = await offlineDB.getDeviceScanHistory();
      setLogs(data);
    } catch {
      // IndexedDB error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleClear = async () => {
    if (!confirm('Clear local on-device scan audit history? This action cannot be undone.')) return;
    await offlineDB.clearDeviceScanHistory();
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#151E33] border border-slate-800 rounded-2xl p-4">
        <div>
          <div className="text-xs font-bold text-white flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-amber-400" />
            <span>Local Device Audit Trail</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Permanent record of all scans taken by this browser instance ({logs.length} logged).
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={handleExportCsv}
            disabled={logs.length === 0}
            className="px-3.5 py-1.5 bg-[#0B1120] border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleClear}
            disabled={logs.length === 0}
            className="px-3.5 py-1.5 bg-red-950/50 border border-red-900/60 hover:bg-red-900/40 rounded-xl text-xs font-semibold text-red-300 flex items-center gap-1.5 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Log</span>
          </button>
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-[#151E33] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0B1120] text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-3 px-4 font-semibold">Student UID</th>
              <th className="py-3 px-4 font-semibold">Name</th>
              <th className="py-3 px-4 font-semibold">Event</th>
              <th className="py-3 px-4 font-semibold">Officer</th>
              <th className="py-3 px-4 font-semibold">Time</th>
              <th className="py-3 px-4 font-semibold text-right">Sync Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Loading on-device log...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  No local scan audit records found on this device.
                </td>
              </tr>
            ) : (
              logs.map((l, i) => {
                const dt = new Date(l.timestamp);
                const timeStr = `${dt.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

                return (
                  <tr key={i} className="hover:bg-slate-900/40">
                    <td className="py-3 px-4 font-mono font-bold text-amber-400">{l.student_uid}</td>
                    <td className="py-3 px-4 font-medium text-white">{l.student_name}</td>
                    <td className="py-3 px-4 text-slate-400">{l.event_name}</td>
                    <td className="py-3 px-4 text-slate-400">{l.officer}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{timeStr}</td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          l.sync_status === 'synced'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : l.sync_status === 'pending_offline'
                            ? 'bg-sky-950 text-sky-400 border border-sky-800/60'
                            : l.sync_status === 'duplicate'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                            : 'bg-red-950 text-red-400 border border-red-800/60'
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
