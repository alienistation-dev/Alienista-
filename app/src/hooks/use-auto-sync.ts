'use client';

import { useEffect, useState, useCallback } from 'react';
import { offlineDB, PendingScan } from '@/lib/offline-db';
import { bulkSyncScansAction } from '@/lib/actions/attendance';

export function useAutoSync(onSyncFinished?: () => void) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      const pending = await offlineDB.getPendingScans();
      setPendingCount(pending.length);
    } catch {
      // IndexedDB not ready or error
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    try {
      const pending: PendingScan[] = await offlineDB.getPendingScans();
      if (pending.length === 0) return;

      setIsSyncing(true);
      const res = await bulkSyncScansAction(pending);

      if (res.success && res.data) {
        for (const item of res.data) {
          if (item.success || item.code === 'DUPLICATE') {
            await offlineDB.removePendingScan(item.client_id);
          }
        }
      }

      await refreshPendingCount();
      if (onSyncFinished) onSyncFinished();
    } catch (e) {
      console.warn('Auto sync error:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, onSyncFinished, refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();

    let debounceTimer: NodeJS.Timeout;
    const handleOnline = () => {
      clearTimeout(debounceTimer);
      // Wait 2s to ensure stable connection before bulk syncing
      debounceTimer = setTimeout(() => {
        triggerSync();
      }, 2000);
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      clearTimeout(debounceTimer);
    };
  }, [refreshPendingCount, triggerSync]);

  return { pendingCount, isSyncing, triggerSync, refreshPendingCount };
}
