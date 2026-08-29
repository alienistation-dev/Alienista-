import {
  OFFLINE_CACHE_VERSION,
  buildOfflineScope,
  shouldResetOfflineCache,
  type OfflineCacheMetadata,
  type PendingScan,
} from '@/lib/offline-sync';
import type { MemberStatus, SyncStatus } from '@/lib/types/models';

const DB_NAME = 'alienista_offline_db';
const DB_VERSION = 2;
const AVATAR_CACHE_PREFIX = `alienista_avatar_cache_v${OFFLINE_CACHE_VERSION}_`;

const STORES = {
  pending: 'pending_scans',
  history: 'device_scan_history',
  students: 'cached_students',
  metadata: 'metadata',
} as const;

export interface CachedRosterStudent {
  cache_key: string;
  scope_key: string;
  organization_id: string;
  event_id: string;
  uid: string;
  full_name: string;
  avatar_url: string | null;
  status: MemberStatus;
}

export interface DeviceScanLog {
  id?: number;
  client_id: string;
  organization_id: string;
  scope_key: string;
  student_uid: string;
  student_name: string;
  event_name: string;
  event_id: string;
  officer: string;
  timestamp: string;
  sync_status: SyncStatus;
  error_message?: string | null;
}

function transactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

class OfflineDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (typeof window === 'undefined') return Promise.reject(new Error('Window undefined'));
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = request.result;
          if (request.transaction && event.oldVersion < DB_VERSION) {
            for (const storeName of Array.from(db.objectStoreNames)) db.deleteObjectStore(storeName);
          }

          const pending = db.createObjectStore(STORES.pending, { keyPath: 'client_id' });
          pending.createIndex('organization_id', 'organization_id', { unique: false });
          pending.createIndex('scope_key', 'scope_key', { unique: false });

          const history = db.createObjectStore(STORES.history, { keyPath: 'id', autoIncrement: true });
          history.createIndex('client_id', 'client_id', { unique: false });
          history.createIndex('organization_id', 'organization_id', { unique: false });
          history.createIndex('scope_key', 'scope_key', { unique: false });

          const students = db.createObjectStore(STORES.students, { keyPath: 'cache_key' });
          students.createIndex('scope_key', 'scope_key', { unique: false });
          db.createObjectStore(STORES.metadata, { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.dbPromise;
  }

  async activateOrganization(organizationId: string): Promise<void> {
    const metadata = await this.getMetadata();
    if (shouldResetOfflineCache(metadata, organizationId)) await this.clearRosterCaches();

    const db = await this.getDB();
    const tx = db.transaction(STORES.metadata, 'readwrite');
    tx.objectStore(STORES.metadata).put({
      key: 'active_context',
      version: OFFLINE_CACHE_VERSION,
      organizationId,
    });
    await transactionComplete(tx);
  }

  private async getMetadata(): Promise<OfflineCacheMetadata | null> {
    const db = await this.getDB();
    const tx = db.transaction(STORES.metadata, 'readonly');
    const request = tx.objectStore(STORES.metadata).get('active_context');
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async savePendingScan(scan: PendingScan): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(STORES.pending, 'readwrite');
    tx.objectStore(STORES.pending).put({
      ...scan,
      scope_key: buildOfflineScope(scan.organization_id, scan.event_id),
    });
    await transactionComplete(tx);
  }

  async getPendingScans(organizationId: string): Promise<PendingScan[]> {
    const db = await this.getDB();
    const tx = db.transaction(STORES.pending, 'readonly');
    const request = tx.objectStore(STORES.pending).index('organization_id').getAll(organizationId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async removePendingScan(clientId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(STORES.pending, 'readwrite');
    tx.objectStore(STORES.pending).delete(clientId);
    await transactionComplete(tx);
  }

  async saveDeviceScanHistory(log: DeviceScanLog): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(STORES.history, 'readwrite');
    tx.objectStore(STORES.history).add(log);
    await transactionComplete(tx);
  }

  async updateDeviceScanHistory(
    clientId: string,
    syncStatus: SyncStatus,
    errorMessage: string | null = null
  ): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(STORES.history, 'readwrite');
    const store = tx.objectStore(STORES.history);
    const request = store.index('client_id').openCursor(IDBKeyRange.only(clientId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.update({ ...cursor.value, sync_status: syncStatus, error_message: errorMessage });
      cursor.continue();
    };
    await transactionComplete(tx);
  }

  async getDeviceScanHistory(organizationId: string): Promise<DeviceScanLog[]> {
    const db = await this.getDB();
    const tx = db.transaction(STORES.history, 'readonly');
    const request = tx.objectStore(STORES.history).index('organization_id').getAll(organizationId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve((request.result || []).reverse());
      request.onerror = () => reject(request.error);
    });
  }

  async clearDeviceScanHistory(organizationId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(STORES.history, 'readwrite');
    const store = tx.objectStore(STORES.history);
    const request = store.index('organization_id').openKeyCursor(IDBKeyRange.only(organizationId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    await transactionComplete(tx);
  }

  async cacheRoster(
    organizationId: string,
    eventId: string,
    students: Array<Pick<CachedRosterStudent, 'uid' | 'full_name' | 'avatar_url' | 'status'>>
  ): Promise<void> {
    // NOTE: This delete-then-insert pattern is safe within a single IDB transaction
    // but assumes a single active tab. Multi-tab concurrent cacheRoster calls for
    // the same scope could race. This is acceptable for a PWA scanner use case
    // where only one tab scans at a time. If multi-tab support is needed, use
    // BroadcastChannel to coordinate cache updates.
    const db = await this.getDB();
    const scopeKey = buildOfflineScope(organizationId, eventId);
    const tx = db.transaction(STORES.students, 'readwrite');
    const store = tx.objectStore(STORES.students);
    const cursorRequest = store.index('scope_key').openKeyCursor(IDBKeyRange.only(scopeKey));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        for (const student of students) {
          store.put({
            ...student,
            cache_key: `${scopeKey}:${student.uid}`,
            scope_key: scopeKey,
            organization_id: organizationId,
            event_id: eventId,
          } satisfies CachedRosterStudent);
        }
        return;
      }
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    await transactionComplete(tx);
  }

  async getCachedRoster(organizationId: string, eventId: string): Promise<CachedRosterStudent[]> {
    const db = await this.getDB();
    const tx = db.transaction(STORES.students, 'readonly');
    const request = tx.objectStore(STORES.students)
      .index('scope_key')
      .getAll(buildOfflineScope(organizationId, eventId));
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async cacheStudentAvatars(
    organizationId: string,
    eventId: string,
    students: Array<{ avatar_url: string | null }>
  ): Promise<void> {
    // NOTE: Avatar URLs are fetched as public CORS requests. This requires the
    // student-avatars bucket to remain public. If the bucket is ever made private,
    // fetch signed URLs server-side before calling this method.
    if (typeof window === 'undefined' || !('caches' in window)) return;
    const cache = await caches.open(`${AVATAR_CACHE_PREFIX}${organizationId}_${eventId}`);
    await Promise.allSettled(students.filter((student) => student.avatar_url).map(async (student) => {
      if (!student.avatar_url || await cache.match(student.avatar_url)) return;
      const response = await fetch(student.avatar_url, { mode: 'cors' });
      if (response.ok) await cache.put(student.avatar_url, response);
    }));
  }

  async clearRosterCaches(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(STORES.students, 'readwrite');
    tx.objectStore(STORES.students).clear();
    await transactionComplete(tx);

    if (typeof window !== 'undefined' && 'caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('alienista_avatar_cache_')).map((name) => caches.delete(name)));
    }
  }
}

export const offlineDB = new OfflineDatabase();
export type { PendingScan } from '@/lib/offline-sync';
