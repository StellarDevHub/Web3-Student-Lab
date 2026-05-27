import * as Y from 'yjs';
import { SnapshotManager, StateSnapshot } from './SnapshotManager';

export class StateManager {
  private snapshotManager: SnapshotManager;

  constructor(private doc: Y.Doc) {
    this.snapshotManager = new SnapshotManager(doc);
  }

  public trackChange(description: string) {
    return this.snapshotManager.takeSnapshot(description);
  }

  public getHistory(): StateSnapshot[] {
    return this.snapshotManager.getSnapshots();
  }

  public revertTo(snapshotId: string) {
    this.snapshotManager.restoreSnapshot(snapshotId);
  }

  public clearHistory() {
    this.snapshotManager.clear();
  }
}
