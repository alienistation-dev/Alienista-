'use client';

import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { Event, Student } from '@/lib/types/models';
import { recordScanAction } from '@/lib/actions/attendance';
import { QrScannerComponent } from '@/components/scanner/qr-scanner';
import { ManualOverrideDialog } from '@/components/scanner/manual-override-dialog';
import { playBeep } from '@/components/scanner/audio';
import { offlineDB } from '@/lib/offline-db';
import { useAutoSync } from '@/hooks/use-auto-sync';
import {
  Camera,
  SwitchCamera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Send,
  UserCheck,
  RefreshCw,
} from 'lucide-react';

interface ScannerViewProps {
  events: Event[];
  students: Student[];
  userRole: string;
  officerName: string;
  officerId: string;
}

interface ScanFeedback {
  status: 'present' | 'dup' | 'offline_queued' | 'invalid';
  name?: string;
  uid?: string;
  detail?: string;
}

export function ScannerView({ events, students, userRole, officerName, officerId }: ScannerViewProps) {
  const openEvents = events.filter((e) => e.status === 'Open');
  const [selectedEventId, setSelectedEventId] = useState<string>(openEvents[0]?.id || '');
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [lastScan, setLastScan] = useState<ScanFeedback | null>(null);
  const [recentScans, setRecentScans] = useState<Array<{ name: string; status: string; time: string }>>([]);
  const [manualUid, setManualUid] = useState('');
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Active Slot Countdown
  const [activeSlotText, setActiveSlotText] = useState<string>('');
  const [slotClosingSoon, setSlotClosingSoon] = useState(false);

  const { pendingCount, isSyncing, triggerSync, refreshPendingCount } = useAutoSync();

  const currentEvent = events.find((e) => e.id === selectedEventId);

  // Update Slot Timer
  useEffect(() => {
    if (!currentEvent?.slots || currentEvent.slots.length === 0) {
      setActiveSlotText('');
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      const activeSlot = currentEvent.slots?.find((s) => {
        const op = new Date(s.opens_at);
        const cl = new Date(s.closes_at);
        return now >= op && now <= cl;
      });

      if (!activeSlot) {
        setActiveSlotText('No active attendance window');
        setSlotClosingSoon(false);
      } else {
        const diffMs = new Date(activeSlot.closes_at).getTime() - now.getTime();
        const mins = Math.max(0, Math.floor(diffMs / 60000));
        setActiveSlotText(`${activeSlot.label} (closes in ${mins}m)`);
        setSlotClosingSoon(mins <= 5);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentEvent]);

  // Core Scan Handler with Instant Local Write + 3s Timeout
  const handleProcessScan = useCallback(
    async (rawUid: string) => {
      const uid = rawUid.trim();
      if (!uid || !selectedEventId) return;

      const clientId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const timestamp = new Date().toISOString();
      const matchedStudent = students.find((s) => s.uid.toLowerCase() === uid.toLowerCase());
      const studentName = matchedStudent?.full_name || uid;

      // 1. Optimistic Local Save
      await offlineDB.savePendingScan({
        client_id: clientId,
        student_uid: uid,
        event_id: selectedEventId,
        officer_name: officerName,
        officer_id: officerId,
        timestamp,
      });

      await offlineDB.saveDeviceScanHistory({
        client_id: clientId,
        student_uid: uid,
        student_name: studentName,
        event_name: currentEvent?.name || 'Event',
        event_id: selectedEventId,
        officer: officerName,
        timestamp,
        sync_status: 'pending_offline',
      });

      refreshPendingCount();

      // 2. Try Server Record with 3-second Timeout
      let isOnline = navigator.onLine;

      if (isOnline) {
        try {
          const timeoutPromise = new Promise<{ success: false; error: string }>((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), 3000)
          );

          const recordPromise = recordScanAction({
            student_uid: uid,
            event_id: selectedEventId,
            client_id: clientId,
            timestamp,
          });

          const res: any = await Promise.race([recordPromise, timeoutPromise]);

          if (res.success) {
            await offlineDB.removePendingScan(clientId);
            setLastScan({
              status: 'present',
              name: res.data.student_name,
              uid,
              detail: 'Attendance Recorded',
            });
            setRecentScans((prev) => [
              { name: res.data.student_name, status: 'Present', time: new Date().toLocaleTimeString() },
              ...prev.slice(0, 9),
            ]);
            playBeep('ok');
            refreshPendingCount();
            return;
          } else if (res.code === 'DUPLICATE') {
            await offlineDB.removePendingScan(clientId);
            setLastScan({
              status: 'dup',
              name: studentName,
              uid,
              detail: 'Already Scanned for this window',
            });
            setRecentScans((prev) => [
              { name: studentName, status: 'Duplicate', time: new Date().toLocaleTimeString() },
              ...prev.slice(0, 9),
            ]);
            playBeep('dup');
            refreshPendingCount();
            return;
          } else {
            setLastScan({
              status: 'invalid',
              name: studentName,
              uid,
              detail: res.error || 'Invalid Scan',
            });
            playBeep('err');
            return;
          }
        } catch {
          // Timeout or Network Failure — falls through to offline queued
        }
      }

      // Offline / Timeout Fallback
      setLastScan({
        status: 'offline_queued',
        name: studentName,
        uid,
        detail: '⚡ Saved locally to device (will sync automatically)',
      });
      setRecentScans((prev) => [
        { name: `${studentName} (Offline)`, status: 'Queued', time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);
      playBeep('ok');
    },
    [currentEvent?.name, officerId, officerName, refreshPendingCount, selectedEventId, students]
  );

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUid.trim()) return;
    startTransition(() => {
      handleProcessScan(manualUid.trim());
      setManualUid('');
    });
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Top Event Selection & Sync Banner */}
      <div className="p-4 bg-[#151E33] border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xl">
        <div className="flex-1 min-w-0">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Active Event
          </label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            disabled={openEvents.length === 0}
            className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none"
          >
            {openEvents.length === 0 ? (
              <option>No open events currently scheduled</option>
            ) : (
              openEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} — {ev.venue}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Sync Status Button */}
        {pendingCount > 0 && (
          <button
            onClick={triggerSync}
            disabled={isSyncing}
            className="bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors self-end sm:self-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync {pendingCount} Offline Scan{pendingCount === 1 ? '' : 's'}</span>
          </button>
        )}
      </div>

      {/* Active Time Window Pill */}
      {activeSlotText && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors ${
            slotClosingSoon
              ? 'bg-amber-950/60 border-amber-800 text-amber-300'
              : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>Active Window: {activeSlotText}</span>
          </div>
        </div>
      )}

      {/* Scanner & Live Feedback Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Camera View */}
        <div className="p-5 bg-[#151E33] border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-400" />
              <span>Camera Stream</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                title="Switch Rear/Front Camera"
                className="p-2 rounded-lg bg-[#0B1120] border border-slate-800 text-slate-400 hover:text-white"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCameraActive((a) => !a)}
                disabled={openEvents.length === 0}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  cameraActive
                    ? 'bg-red-950/60 text-red-400 border border-red-800'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                }`}
              >
                {cameraActive ? 'Stop' : 'Start Camera'}
              </button>
            </div>
          </div>

          <QrScannerComponent onScan={handleProcessScan} facingMode={facingMode} active={cameraActive} />

          {/* Manual UID Fallback Form */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Or type/paste Student UID..."
              value={manualUid}
              onChange={(e) => setManualUid(e.target.value)}
              disabled={openEvents.length === 0}
              className="flex-1 bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={isPending || !manualUid.trim() || openEvents.length === 0}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Record</span>
            </button>
          </form>
        </div>

        {/* Right Column: Live Status Banner & Recent Feed */}
        <div className="flex flex-col space-y-4">
          {/* Prominent Scan Feedback Banner */}
          <div className="p-6 bg-[#151E33] border border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center min-h-[160px] shadow-lg">
            {!lastScan ? (
              <div className="text-slate-500 text-xs flex flex-col items-center gap-2">
                <Camera className="w-8 h-8 opacity-40" />
                <span>Ready to scan badge or enter student UID.</span>
              </div>
            ) : lastScan.status === 'present' ? (
              <div className="space-y-1">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <div className="text-sm font-bold text-emerald-400 uppercase tracking-wider">✓ Present Recorded</div>
                <div className="text-base font-bold text-white">{lastScan.name}</div>
                <div className="text-xs font-mono text-slate-400">{lastScan.uid}</div>
              </div>
            ) : lastScan.status === 'dup' ? (
              <div className="space-y-1">
                <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                <div className="text-sm font-bold text-amber-400 uppercase tracking-wider">Already Scanned</div>
                <div className="text-base font-bold text-white">{lastScan.name}</div>
                <div className="text-xs text-slate-400">{lastScan.detail}</div>
              </div>
            ) : lastScan.status === 'offline_queued' ? (
              <div className="space-y-1">
                <CheckCircle2 className="w-10 h-10 text-sky-400 mx-auto" />
                <div className="text-sm font-bold text-sky-400 uppercase tracking-wider">⚡ Saved Offline</div>
                <div className="text-base font-bold text-white">{lastScan.name}</div>
                <div className="text-xs text-slate-400">{lastScan.detail}</div>
              </div>
            ) : (
              <div className="space-y-1">
                <XCircle className="w-10 h-10 text-red-400 mx-auto" />
                <div className="text-sm font-bold text-red-400 uppercase tracking-wider">✕ Invalid Scan</div>
                <div className="text-xs text-slate-300 font-mono">{lastScan.uid}</div>
                <div className="text-xs text-red-400">{lastScan.detail}</div>
              </div>
            )}
          </div>

          {/* Recent Scans Session Feed */}
          <div className="p-4 bg-[#151E33] border border-slate-800 rounded-2xl flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-200">Recent Scans This Session</h4>
              {userRole === 'admin' && (
                <button
                  onClick={() => setIsOverrideOpen(true)}
                  className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <UserCheck className="w-3 h-3" />
                  Manual Override
                </button>
              )}
            </div>

            <div className="space-y-2 flex-1 max-h-48 overflow-y-auto pr-1">
              {recentScans.length === 0 ? (
                <div className="text-xs text-slate-500 py-6 text-center">No scans recorded in this session yet.</div>
              ) : (
                recentScans.map((sc, i) => (
                  <div key={i} className="p-2.5 rounded-xl bg-[#0B1120]/70 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">{sc.name}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          sc.status === 'Present'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : sc.status === 'Queued'
                            ? 'bg-sky-950 text-sky-400 border border-sky-800/60'
                            : 'bg-amber-950 text-amber-400 border border-amber-800/60'
                        }`}
                      >
                        {sc.status}
                      </span>
                      <span className="text-[10px] text-slate-500">{sc.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Manual Override Dialog */}
      <ManualOverrideDialog
        students={students}
        events={events}
        isOpen={isOverrideOpen}
        onClose={() => setIsOverrideOpen(false)}
        onSuccess={() => {
          setRecentScans((prev) => [
            { name: 'Admin Override', status: 'Present', time: new Date().toLocaleTimeString() },
            ...prev,
          ]);
        }}
      />
    </div>
  );
}
