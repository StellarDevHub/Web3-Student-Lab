import * as Y from 'yjs';

export interface StateSnapshot {
  id: string;
  timestamp: number;
  data: Uint8Array; // Yjs state update
  description: string;
}

export class SnapshotManager {
  private snapshots: StateSnapshot[] = [];
  private maxSnapshots = 100;

  constructor(private doc: Y.Doc) {}

  public takeSnapshot(description: string): StateSnapshot {
    const snapshot: StateSnapshot = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      data: Y.encodeStateAsUpdate(this.doc),
      description,
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  public getSnapshots(): StateSnapshot[] {
    return this.snapshots;
  }

  public restoreSnapshot(id: string) {
    const snapshot = this.snapshots.find(s => s.id === id);
    if (snapshot) {
      this.doc.transact(() => {
        // Clear all shared types to ensure a clean restoration
        for (const type of this.doc.share.values()) {
          if (type instanceof Y.Text) {
            type.delete(0, type.length);
          } else if (type instanceof Y.Array) {
            type.delete(0, type.length);
          } else if (type instanceof Y.Map) {
            type.clear();
          }
        }
        Y.applyUpdate(this.doc, snapshot.data);
      });
    }
  }

  public clear() {
    this.snapshots = [];
  }
}
