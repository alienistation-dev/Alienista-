const DB_NAME = 'alienista_offline_db';
const DB_VERSION = 1;

export interface PendingScan {
  client_id: string;
  student_uid: string;
  event_id: string;
  slot_id?: string | null;
  officer_name: string;
  officer_id?: string | null;
  timestamp: string;
}

export interface DeviceScanLog {
  id?: number;
  client_id: string;
  student_uid: string;
  student_name: string;
  event_name: string;
  event_id: string;
  officer: string;
  timestamp: string;
  sync_status: 'pending_offline' | 'synced' | 'duplicate' | 'invalid' | 'error';
}

class OfflineDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (typeof window === 'undefined') return Promise.reject(new Error('Window undefined'));
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e: any) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('pending_scans')) {
            db.createObjectStore('pending_scans', { keyPath: 'client_id' });
          }
          if (!db.objectStoreNames.contains('device_scan_history')) {
            const history = db.createObjectStore('device_scan_history', { keyPath: 'id', autoIncrement: true });
            history.createIndex('client_id', 'client_id', { unique: false });
          }
          if (!db.objectStoreNames.contains('cached_students')) {
            db.createObjectStore('cached_students', { keyPath: 'uid' });
          }
          if (!db.objectStoreNames.contains('cached_events')) {
            db.createObjectStore('cached_events', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  async savePendingScan(scan: PendingScan): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('pending_scans', 'readwrite');
    tx.objectStore('pending_scans').put(scan);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPendingScans(): Promise<PendingScan[]> {
    const db = await this.getDB();
    const tx = db.transaction('pending_scans', 'readonly');
    const req = tx.objectStore('pending_scans').getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async removePendingScan(clientId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('pending_scans', 'readwrite');
    tx.objectStore('pending_scans').delete(clientId);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveDeviceScanHistory(log: DeviceScanLog): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('device_scan_history', 'readwrite');
    tx.objectStore('device_scan_history').add(log);
  }

  async getDeviceScanHistory(): Promise<DeviceScanLog[]> {
    const db = await this.getDB();
    const tx = db.transaction('device_scan_history', 'readonly');
    const req = tx.objectStore('device_scan_history').getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve((req.result || []).reverse());
      req.onerror = () => reject(req.error);
    });
  }

  async clearDeviceScanHistory(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('device_scan_history', 'readwrite');
    tx.objectStore('device_scan_history').clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async cacheStudentAvatars(students: Array<{ uid: string; avatar_url: string | null }>): Promise<void> {
    if (typeof window === 'undefined' || !('caches' in window)) return;
    try {
      const cache = await caches.open('alienista_avatar_cache_v1');
      const validAvatars = students.filter((s) => Boolean(s.avatar_url));
      await Promise.allSettled(
        validAvatars.map(async (s) => {
          if (!s.avatar_url) return;
          try {
            const existing = await cache.match(s.avatar_url);
            if (!existing) {
              const res = await fetch(s.avatar_url, { mode: 'cors' });
              if (res.ok) {
                await cache.put(s.avatar_url, res);
              }
            }
          } catch {
            // Ignore offline network failure during pre-caching
          }
        })
      );
    } catch {
      // Ignore cache API failures
    }
  }
}

export const offlineDB = new OfflineDatabase();
