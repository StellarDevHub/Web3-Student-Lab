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
    const snapshot = this.snapshots.find((s) => s.id === id);
    if (snapshot) {
      this.doc.transact(() => {
        // Clear all shared types to ensure a clean restoration
        for (const type of Array.from(this.doc.share.values())) {
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

/**
 * One point in a step debugger's history (Issue #1784).
 *
 * `SnapshotManager` above snapshots a shared Yjs document; this generic store
 * snapshots an arbitrary immutable value instead. The WASM opcode stepper uses
 * it to make backwards stepping exact rather than trying to invert opcodes: the
 * full VM state (call frames, locals, operand stack, program counter) is stored
 * after every executed instruction.
 */
export interface VMSnapshot<T> {
  id: string;
  timestamp: number;
  label: string;
  state: T;
}

export class VMSnapshotManager<T> {
  private snapshots: VMSnapshot<T>[] = [];
  private index = 0;

  constructor(
    initialState: T,
    label = 'initial',
    private readonly maxSnapshots = 500,
  ) {
    this.snapshots = [this.createSnapshot(initialState, label)];
  }

  private createSnapshot(state: T, label: string): VMSnapshot<T> {
    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      label,
      state,
    };
  }

  public get current(): T {
    return this.snapshots[this.index].state;
  }

  public get currentIndex(): number {
    return this.index;
  }

  public get canGoBack(): boolean {
    return this.index > 0;
  }

  public get canGoForward(): boolean {
    return this.index < this.snapshots.length - 1;
  }

  public getSnapshots(): readonly VMSnapshot<T>[] {
    return this.snapshots;
  }

  /** Record a new state, discarding any redo history beyond the current point. */
  public push(state: T, label: string): VMSnapshot<T> {
    this.snapshots = this.snapshots.slice(0, this.index + 1);
    const snapshot = this.createSnapshot(state, label);
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
    this.index = this.snapshots.length - 1;
    return snapshot;
  }

  public back(): T {
    if (this.canGoBack) this.index -= 1;
    return this.current;
  }

  public forward(): T {
    if (this.canGoForward) this.index += 1;
    return this.current;
  }

  public jumpTo(index: number): T {
    if (index >= 0 && index < this.snapshots.length) this.index = index;
    return this.current;
  }

  public reset(state: T, label = 'initial'): VMSnapshot<T> {
    this.snapshots = [this.createSnapshot(state, label)];
    this.index = 0;
    return this.snapshots[0];
  }

  public clear(): void {
    this.snapshots = [];
    this.index = 0;
  }
}
