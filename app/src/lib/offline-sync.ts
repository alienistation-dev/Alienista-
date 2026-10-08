import type { SyncFailure } from '@/lib/types/models';

export const OFFLINE_CACHE_VERSION = 2;

export interface OfflineCacheMetadata {
  version: number;
  organizationId: string;
}

export interface PendingScan {
  client_id: string;
  organization_id: string;
  student_uid: string;
  event_id: string;
  slot_id?: string | null;
  officer_name: string;
  officer_id?: string | null;
  timestamp: string;
  attempts: number;
  failure: SyncFailure | null;
}

export interface SyncScanResult {
  client_id: string;
  success: boolean;
  error?: string;
  code?: string;
}

export function buildOfflineScope(organizationId: string, eventId: string): string {
  return `${organizationId}:${eventId}`;
}

export function shouldResetOfflineCache(
  metadata: OfflineCacheMetadata | null,
  organizationId: string
): boolean {
  return !metadata
    || metadata.version !== OFFLINE_CACHE_VERSION
    || metadata.organizationId !== organizationId;
}

function isRetriableFailure(code: string): boolean {
  return ['SYNC_ERROR', 'TIMEOUT', 'SERVER_ERROR', 'UNAVAILABLE'].includes(code);
}

export function reconcileSyncResults(
  scans: PendingScan[],
  results: SyncScanResult[],
  attemptedAt: string = new Date().toISOString()
): { completedClientIds: string[]; retained: PendingScan[] } {
  const byClientId = new Map(results.map((result) => [result.client_id, result]));
  const completedClientIds: string[] = [];
  const retained: PendingScan[] = [];

  for (const scan of scans) {
    const result = byClientId.get(scan.client_id);
    if (result?.success || result?.code === 'DUPLICATE') {
      completedClientIds.push(scan.client_id);
      continue;
    }

    const code = result?.code || 'SYNC_ERROR';
    retained.push({
      ...scan,
      attempts: scan.attempts + 1,
      failure: {
        client_id: scan.client_id,
        code,
        message: result?.error || 'The scan could not be synchronized. Retry when the connection is stable.',
        retriable: isRetriableFailure(code),
        attempts: scan.attempts + 1,
        last_attempt_at: attemptedAt,
      },
    });
  }

  return { completedClientIds, retained };
}
