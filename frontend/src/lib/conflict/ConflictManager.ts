import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch';
import * as Y from 'yjs';

export interface ConflictInfo {
  id: string;
  timestamp: number;
  mine: string;
  theirs: string;
  base: string;
  resolved: boolean;
}

export interface ConflictPatch {
  type: 'insert' | 'delete' | 'equal';
  text: string;
}

class ConflictManager {
  private conflicts: Map<string, ConflictInfo> = new Map();
  private listeners: Set<(conflicts: ConflictInfo[]) => void> = new Set();
  private dmp: DiffMatchPatch;

  constructor() {
    this.dmp = new DiffMatchPatch();
  }

  detectConflicts(doc: Y.Doc, localVersion: string): ConflictInfo[] {
    const detected: ConflictInfo[] = [];
    const remoteText = doc.getText('content').toString();

    if (remoteText !== localVersion) {
      const baseVersion = this.getBaseVersion(doc);
      const conflict: ConflictInfo = {
        id: `conflict-${Date.now()}`,
        timestamp: Date.now(),
        mine: localVersion,
        theirs: remoteText,
        base: baseVersion,
        resolved: false,
      };

      this.conflicts.set(conflict.id, conflict);
      detected.push(conflict);
    }

    this.notifyListeners();
    return detected;
  }

  getDiff(original: string, modified: string): ConflictPatch[] {
    const diffs = this.dmp.diff_main(original, modified);
    this.dmp.diff_cleanupSemantic(diffs);

    return diffs.map(([op, text]) => ({
      type: op === 1 ? 'insert' : op === -1 ? 'delete' : 'equal',
      text,
    }));
  }

  acceptMine(conflictId: string, doc: Y.Doc): void {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) return;

    doc.getText('content').delete(0, doc.getText('content').length);
    doc.getText('content').insert(0, conflict.mine);

    this.markResolved(conflictId);
  }

  acceptTheirs(conflictId: string): void {
    this.markResolved(conflictId);
  }

  mergeManual(conflictId: string, mergedText: string, doc: Y.Doc): void {
    doc.getText('content').delete(0, doc.getText('content').length);
    doc.getText('content').insert(0, mergedText);

    this.markResolved(conflictId);
  }

  acceptAll(doc: Y.Doc, strategy: 'mine' | 'theirs'): void {
    this.conflicts.forEach((conflict) => {
      if (!conflict.resolved) {
        if (strategy === 'mine') {
          this.acceptMine(conflict.id, doc);
        } else {
          this.acceptTheirs(conflict.id);
        }
      }
    });
  }

  getPendingConflicts(): ConflictInfo[] {
    return Array.from(this.conflicts.values()).filter((c) => !c.resolved);
  }

  getAllConflicts(): ConflictInfo[] {
    return Array.from(this.conflicts.values());
  }

  onConflictsChanged(callback: (conflicts: ConflictInfo[]) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  clearResolved(): void {
    this.conflicts.forEach((conflict, key) => {
      if (conflict.resolved) this.conflicts.delete(key);
    });
    this.notifyListeners();
  }

  private getBaseVersion(doc: Y.Doc): string {
    const baseArray = doc.getArray('version-history');
    const history = baseArray.toArray();
    if (history.length > 0) {
      return (history[history.length - 1] as { content: string }).content || '';
    }
    return '';
  }

  private markResolved(conflictId: string): void {
    const conflict = this.conflicts.get(conflictId);
    if (conflict) {
      conflict.resolved = true;
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    const pending = this.getPendingConflicts();
    this.listeners.forEach((listener) => listener(pending));
  }
}

export const conflictManager = new ConflictManager();
