'use client';

import { useCallback, useEffect, useState } from 'react';
import { bulkSyncScansAction } from '@/lib/actions/attendance';
import { offlineDB } from '@/lib/offline-db';
import { reconcileSyncResults } from '@/lib/offline-sync';
import type { SyncFailure } from '@/lib/types/models';

export function useAutoSync(organizationId: string, onSyncFinished?: () => void) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ completed: 0, total: 0 });
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [failures, setFailures] = useState<SyncFailure[]>([]);

  const refreshPendingState = useCallback(async () => {
    if (typeof window === 'undefined' || !organizationId) return;
    const pending = await offlineDB.getPendingScans(organizationId);
    setPendingCount(pending.length);
    setFailures(pending.flatMap((scan) => scan.failure ? [scan.failure] : []));
  }, [organizationId]);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing || !organizationId) return;
    setIsSyncing(true);
    try {
      const pending = await offlineDB.getPendingScans(organizationId);
      const retryable = pending.filter((scan) => !scan.failure || scan.failure.retriable);
      setSyncProgress({ completed: 0, total: retryable.length });
      if (retryable.length === 0) return;

      const response = await bulkSyncScansAction(retryable);
      const results = response.success
        ? response.data
        : retryable.map((scan) => ({
            client_id: scan.client_id,
            success: false,
            code: 'SYNC_ERROR',
            error: response.error,
          }));
      const reconciliation = reconcileSyncResults(retryable, results);

      for (const clientId of reconciliation.completedClientIds) {
        const result = results.find((item) => item.client_id === clientId);
        await offlineDB.removePendingScan(clientId);
        await offlineDB.updateDeviceScanHistory(
          clientId,
          result?.code === 'DUPLICATE' ? 'duplicate' : 'synced',
          result?.error || null
        );
        setSyncProgress((current) => ({ ...current, completed: current.completed + 1 }));
      }

      for (const scan of reconciliation.retained) {
        await offlineDB.savePendingScan(scan);
        await offlineDB.updateDeviceScanHistory(
          scan.client_id,
          scan.failure?.retriable ? 'error' : 'invalid',
          scan.failure?.message || null
        );
        setSyncProgress((current) => ({ ...current, completed: current.completed + 1 }));
      }

      if (reconciliation.completedClientIds.length > 0) setLastSuccessAt(new Date().toISOString());
      await refreshPendingState();
      onSyncFinished?.();
    } catch (error) {
      console.warn('Auto sync error:', error);
      await refreshPendingState();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, onSyncFinished, organizationId, refreshPendingState]);

  useEffect(() => {
    if (!organizationId) return;
    void Promise.resolve().then(() => setIsOnline(navigator.onLine));
    offlineDB.activateOrganization(organizationId).then(refreshPendingState).catch(() => undefined);

    let debounceTimer: ReturnType<typeof setTimeout>;
    const handleOnline = () => {
      setIsOnline(true);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(triggerSync, 2000);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(debounceTimer);
    };
  }, [organizationId, refreshPendingState, triggerSync]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    syncProgress,
    lastSuccessAt,
    failures,
    triggerSync,
    refreshPendingState,
  };
}
