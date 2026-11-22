import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

function openV1(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('alienista_offline_db', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('pending_scans', { keyPath: 'client_id' })
        .put({ client_id: 'scan-1', student_uid: 'ST-1', event_id: 'event-1', officer_name: 'Officer', timestamp: '2026-11-23T01:00:00Z' });
      db.createObjectStore('cached_students', { keyPath: 'uid' });
      db.createObjectStore('cached_events', { keyPath: 'id' });
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
}

describe('offline database upgrade', () => {
  it('keeps queued scans when the schema version changes', async () => {
    await openV1();
    vi.stubGlobal('window', globalThis);
    const { offlineDB } = await import('@/lib/offline-db');

    await offlineDB.savePendingScan({
      client_id: 'scan-2', organization_id: 'org-1', student_uid: 'ST-2', event_id: 'event-1',
      officer_name: 'Officer', timestamp: '2026-11-23T02:00:00Z',
    } as Parameters<typeof offlineDB.savePendingScan>[0]);

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('alienista_offline_db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = await new Promise<Array<{ client_id: string }>>((resolve) => {
      const request = db.transaction('pending_scans').objectStore('pending_scans').getAll();
      request.onsuccess = () => resolve(request.result);
    });
    expect(all.map((scan) => scan.client_id).sort()).toEqual(['scan-1', 'scan-2']);
    expect(Array.from(db.objectStoreNames)).not.toContain('cached_events');
    db.close();
  });
});
