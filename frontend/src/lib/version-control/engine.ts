export interface Version {
  id: string;
  documentId: string;
  versionNumber: number;
  title: string;
  content: string;
  author: string;
  message: string;
  parentId: string | null;
  timestamp: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber: number;
}

export interface DocumentEntry {
  id: string;
  title: string;
  currentVersion: number;
  versions: Version[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_PREFIX = 'vc_';

function generateId(prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = prefix;
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getStorageKey(documentId: string): string {
  return `${STORAGE_PREFIX}${documentId}`;
}

function getAllDocumentKeys(): string[] {
  if (typeof window === 'undefined') return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      keys.push(key.replace(STORAGE_PREFIX, ''));
    }
  }
  return keys;
}

export class VersionControl {
  static createDocument(title: string, content: string, author: string, message?: string): DocumentEntry {
    const id = generateId('doc_');
    const now = Date.now();
    const version: Version = {
      id: generateId('ver_'),
      documentId: id,
      versionNumber: 1,
      title,
      content,
      author,
      message: message || 'Initial version',
      parentId: null,
      timestamp: now,
      tags: [],
      metadata: {},
    };

    const doc: DocumentEntry = {
      id,
      title,
      currentVersion: 1,
      versions: [version],
      createdAt: now,
      updatedAt: now,
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem(getStorageKey(id), JSON.stringify(doc));
    }

    return doc;
  }

  static getDocument(documentId: string): DocumentEntry | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(getStorageKey(documentId));
      if (!raw) return null;
      return JSON.parse(raw) as DocumentEntry;
    } catch {
      return null;
    }
  }

  static getAllDocuments(): DocumentEntry[] {
    if (typeof window === 'undefined') return [];
    const keys = getAllDocumentKeys();
    return keys
      .map((key) => this.getDocument(key))
      .filter((doc): doc is DocumentEntry => doc !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  static createVersion(
    documentId: string,
    title: string,
    content: string,
    author: string,
    message: string,
    tags?: string[]
  ): Version | null {
    const doc = this.getDocument(documentId);
    if (!doc) return null;

    const parentVersion = doc.versions[doc.versions.length - 1];
    const newVersionNumber = doc.currentVersion + 1;

    const version: Version = {
      id: generateId('ver_'),
      documentId,
      versionNumber: newVersionNumber,
      title,
      content,
      author,
      message,
      parentId: parentVersion?.id || null,
      timestamp: Date.now(),
      tags: tags || [],
      metadata: {},
    };

    doc.versions.push(version);
    doc.currentVersion = newVersionNumber;
    doc.title = title;
    doc.updatedAt = Date.now();

    if (typeof window !== 'undefined') {
      localStorage.setItem(getStorageKey(documentId), JSON.stringify(doc));
    }

    return version;
  }

  static getVersion(documentId: string, versionId: string): Version | null {
    const doc = this.getDocument(documentId);
    if (!doc) return null;
    return doc.versions.find((v) => v.id === versionId) || null;
  }

  static getLatestVersion(documentId: string): Version | null {
    const doc = this.getDocument(documentId);
    if (!doc || doc.versions.length === 0) return null;
    return doc.versions[doc.versions.length - 1];
  }

  static rollback(documentId: string, targetVersionId: string, author: string): Version | null {
    const doc = this.getDocument(documentId);
    if (!doc) return null;

    const targetVersion = doc.versions.find((v) => v.id === targetVersionId);
    if (!targetVersion) return null;

    return this.createVersion(
      documentId,
      targetVersion.title,
      targetVersion.content,
      author,
      `Rollback to version ${targetVersion.versionNumber}: ${targetVersion.message}`
    );
  }

  static compareVersions(documentId: string, versionIdA: string, versionIdB: string): DiffLine[] {
    const doc = this.getDocument(documentId);
    if (!doc) return [];

    const versionA = doc.versions.find((v) => v.id === versionIdA);
    const versionB = doc.versions.find((v) => v.id === versionIdB);
    if (!versionA || !versionB) return [];

    return this.diff(versionA.content, versionB.content);
  }

  static diff(textA: string, textB: string): DiffLine[] {
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    const maxLen = Math.max(linesA.length, linesB.length);
    const result: DiffLine[] = [];

    for (let i = 0; i < maxLen; i++) {
      if (i >= linesA.length) {
        result.push({ type: 'added', content: linesB[i] || '', lineNumber: i + 1 });
      } else if (i >= linesB.length) {
        result.push({ type: 'removed', content: linesA[i] || '', lineNumber: i + 1 });
      } else if (linesA[i] === linesB[i]) {
        result.push({ type: 'unchanged', content: linesA[i], lineNumber: i + 1 });
      } else {
        result.push({ type: 'removed', content: linesA[i], lineNumber: i + 1 });
        result.push({ type: 'added', content: linesB[i], lineNumber: i + 1 });
      }
    }

    return result;
  }

  static deleteDocument(documentId: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
      localStorage.removeItem(getStorageKey(documentId));
      return true;
    } catch {
      return false;
    }
  }

  static getVersionHistory(documentId: string): Version[] {
    const doc = this.getDocument(documentId);
    if (!doc) return [];
    return [...doc.versions].sort((a, b) => b.timestamp - a.timestamp);
  }
}
