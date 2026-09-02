'use client';

export interface StoredFileRecord {
  id: string;
  path: string;
  content: string;
  updatedAt: number;
  version: number;
}

export interface StoredMetadataRecord {
  key: string;
  value: string;
  updatedAt: number;
}

export interface RoadmapNodeRecord {
  id: number;
  status: string;
  updatedAt: number;
}

const DB_NAME = 'web3-student-lab';
const DB_VERSION = 2; // Incremented version for new store
const FILES_STORE = 'files';
const METADATA_STORE = 'metadata';
const ROADMAP_STORE = 'roadmap_nodes';

export class DatabaseManager {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private awaitTransaction(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          const filesStore = db.createObjectStore(FILES_STORE, { keyPath: 'id' });
          filesStore.createIndex('path', 'path', { unique: true });
          filesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(ROADMAP_STORE)) {
          const roadmapStore = db.createObjectStore(ROADMAP_STORE, { keyPath: 'id' });
          roadmapStore.createIndex('status', 'status', { unique: false });
          roadmapStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    });

    return this.dbPromise;
  }

  async upsertFile(record: Omit<StoredFileRecord, 'version'> & { version?: number }) {
    const db = await this.openDb();
    const version = record.version ?? 1;
    const tx = db.transaction(FILES_STORE, 'readwrite');
    tx.objectStore(FILES_STORE).put({ ...record, version });
    await this.awaitTransaction(tx);
  }

  async getFileByPath(path: string): Promise<StoredFileRecord | null> {
    const db = await this.openDb();
    const tx = db.transaction(FILES_STORE, 'readonly');
    const index = tx.objectStore(FILES_STORE).index('path');
    const result = await new Promise<StoredFileRecord | undefined>((resolve, reject) => {
      const request = index.get(path);
      request.onsuccess = () => resolve(request.result as StoredFileRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error('Failed to read file record'));
    });
    return result ?? null;
  }

  async listFiles(): Promise<StoredFileRecord[]> {
    const db = await this.openDb();
    const tx = db.transaction(FILES_STORE, 'readonly');
    const store = tx.objectStore(FILES_STORE);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result as StoredFileRecord[]) ?? []);
      request.onerror = () => reject(request.error ?? new Error('Failed to list files'));
    });
  }

  async setMetadata(key: string, value: string) {
    const db = await this.openDb();
    const tx = db.transaction(METADATA_STORE, 'readwrite');
    tx.objectStore(METADATA_STORE).put({
      key,
      value,
      updatedAt: Date.now(),
    } as StoredMetadataRecord);
    await this.awaitTransaction(tx);
  }

  async getMetadata(key: string): Promise<StoredMetadataRecord | null> {
    const db = await this.openDb();
    const tx = db.transaction(METADATA_STORE, 'readonly');
    const record = await new Promise<StoredMetadataRecord | undefined>((resolve, reject) => {
      const request = tx.objectStore(METADATA_STORE).get(key);
      request.onsuccess = () => resolve(request.result as StoredMetadataRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error('Failed to read metadata'));
    });
    return record ?? null;
  }

  async upsertRoadmapNode(record: RoadmapNodeRecord) {
    const db = await this.openDb();
    const tx = db.transaction(ROADMAP_STORE, 'readwrite');
    tx.objectStore(ROADMAP_STORE).put(record);
    await this.awaitTransaction(tx);
  }

  async getRoadmapNode(id: number): Promise<RoadmapNodeRecord | null> {
    const db = await this.openDb();
    const tx = db.transaction(ROADMAP_STORE, 'readonly');
    const record = await new Promise<RoadmapNodeRecord | undefined>((resolve, reject) => {
      const request = tx.objectStore(ROADMAP_STORE).get(id);
      request.onsuccess = () => resolve(request.result as RoadmapNodeRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error('Failed to read roadmap node'));
    });
    return record ?? null;
  }

  async listRoadmapNodes(): Promise<RoadmapNodeRecord[]> {
    const db = await this.openDb();
    const tx = db.transaction(ROADMAP_STORE, 'readonly');
    const store = tx.objectStore(ROADMAP_STORE);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result as RoadmapNodeRecord[]) ?? []);
      request.onerror = () => reject(request.error ?? new Error('Failed to list roadmap nodes'));
    });
  }
}
