import { describe, expect, it } from 'vitest';
import {
  OFFLINE_CACHE_VERSION,
  buildOfflineScope,
  reconcileSyncResults,
  shouldResetOfflineCache,
  type PendingScan,
} from '@/lib/offline-sync';

function pending(overrides: Partial<PendingScan> = {}): PendingScan {
  return {
    client_id: 'scan-1',
    organization_id: 'org-1',
    student_uid: 'ST-2026-0001',
    event_id: 'event-1',
    officer_name: 'Officer One',
    timestamp: '2026-08-22T08:00:00.000Z',
    attempts: 0,
    failure: null,
    ...overrides,
  };
}

describe('offline cache scope and versioning', () => {
  it('isolates cached data by organization and active event', () => {
    expect(buildOfflineScope('org-1', 'event-1')).toBe('org-1:event-1');
    expect(buildOfflineScope('org-1', 'event-2')).not.toBe(buildOfflineScope('org-1', 'event-1'));
    expect(buildOfflineScope('org-2', 'event-1')).not.toBe(buildOfflineScope('org-1', 'event-1'));
  });

  it('invalidates cache metadata after a schema version or organization change', () => {
    expect(shouldResetOfflineCache({ version: OFFLINE_CACHE_VERSION - 1, organizationId: 'org-1' }, 'org-1')).toBe(true);
    expect(shouldResetOfflineCache({ version: OFFLINE_CACHE_VERSION, organizationId: 'org-1' }, 'org-2')).toBe(true);
    expect(shouldResetOfflineCache({ version: OFFLINE_CACHE_VERSION, organizationId: 'org-1' }, 'org-1')).toBe(false);
  });
});

describe('offline sync reconciliation', () => {
  it('removes successful and duplicate replays but retains invalid scans for review', () => {
    const scans = [pending(), pending({ client_id: 'scan-2' }), pending({ client_id: 'scan-3' })];
    const result = reconcileSyncResults(scans, [
      { client_id: 'scan-1', success: true },
      { client_id: 'scan-2', success: false, code: 'DUPLICATE', error: 'Already recorded.' },
      { client_id: 'scan-3', success: false, code: 'INVALID_SCAN', error: 'Student UID not found.' },
    ], '2026-08-22T09:00:00.000Z');

    expect(result.completedClientIds).toEqual(['scan-1', 'scan-2']);
    expect(result.retained).toHaveLength(1);
    expect(result.retained[0]).toMatchObject({
      client_id: 'scan-3',
      attempts: 1,
      failure: {
        code: 'INVALID_SCAN',
        message: 'Student UID not found.',
        retriable: false,
        last_attempt_at: '2026-08-22T09:00:00.000Z',
      },
    });
  });

  it('retains transient failures as actionable retryable work', () => {
    const result = reconcileSyncResults([pending()], [
      { client_id: 'scan-1', success: false, code: 'SYNC_ERROR', error: 'Network request failed.' },
    ], '2026-08-22T09:00:00.000Z');

    expect(result.retained[0]).toMatchObject({
      attempts: 1,
      failure: { retriable: true, code: 'SYNC_ERROR' },
    });
  });
});
