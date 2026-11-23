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

export interface RevisionRecord {
  id: string;
  path: string;
  content: string;
  parentId: string | null;
  createdAt: number;
}

const DB_NAME = 'web3-student-lab';
const DB_VERSION = 3;
const FILES_STORE = 'files';
const METADATA_STORE = 'metadata';
const ROADMAP_STORE = 'roadmap_nodes';
const REVISIONS_STORE = 'revisions';

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
        if (!db.objectStoreNames.contains(REVISIONS_STORE)) {
          const revisionsStore = db.createObjectStore(REVISIONS_STORE, { keyPath: 'id' });
          revisionsStore.createIndex('path', 'path', { unique: false });
          revisionsStore.createIndex('createdAt', 'createdAt', { unique: false });
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

  async createRevision(path: string, content: string): Promise<RevisionRecord> {
    const db = await this.openDb();
    const tx = db.transaction([REVISIONS_STORE, METADATA_STORE], 'readwrite');
    const revisions = tx.objectStore(REVISIONS_STORE);
    const metadata = tx.objectStore(METADATA_STORE);
    const headKey = `playground:revision-head:${path}`;
    const record: RevisionRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      path,
      content,
      parentId: null,
      createdAt: Date.now(),
    };
    const headRequest = metadata.get(headKey);

    headRequest.onsuccess = () => {
      const currentHead = headRequest.result as StoredMetadataRecord | undefined;
      record.parentId = currentHead?.value ?? null;
      revisions.put(record);
      metadata.put({ key: headKey, value: record.id, updatedAt: record.createdAt });
    };

    await this.awaitTransaction(tx);
    return record;
  }

  async listRevisions(path: string): Promise<RevisionRecord[]> {
    const db = await this.openDb();
    const tx = db.transaction(REVISIONS_STORE, 'readonly');
    const request = tx.objectStore(REVISIONS_STORE).index('path').getAll(path);
    return new Promise((resolve, reject) => {
      request.onsuccess = () =>
        resolve(
          ((request.result as RevisionRecord[]) ?? []).sort((left, right) =>
            right.createdAt - left.createdAt
          )
        );
      request.onerror = () => reject(request.error ?? new Error('Failed to list revisions'));
    });
  }

  async getRevision(id: string): Promise<RevisionRecord | null> {
    const db = await this.openDb();
    const tx = db.transaction(REVISIONS_STORE, 'readonly');
    const request = tx.objectStore(REVISIONS_STORE).get(id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as RevisionRecord | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Failed to read revision'));
    });
  }

  async setRevisionHead(path: string, revisionId: string): Promise<void> {
    await this.setMetadata(`playground:revision-head:${path}`, revisionId);
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
