import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import type { Editor } from 'tldraw';
import {
  CompactShapePayload,
  decodeShapeBinary,
  encodeShapeBinary,
} from './BinaryCodec';

export interface AwarenessUserState {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number } | null;
  selectedShapeIds?: string[];
}

export interface BandwidthStats {
  binaryBytesSent: number;
  equivalentJsonBytes: number;
  reductionPercent: number;
}

const LOCAL_ORIGIN = 'whiteboard-local';
const REMOTE_ORIGIN = 'whiteboard-remote';

/**
 * Synchronizes whiteboard shapes, sticky notes, and freehand drawing paths
 * using binary Yjs CRDT update vectors and y-protocols/awareness.
 */
export class SyncManager {
  private yShapes: Y.Map<Uint8Array>;
  private awareness: Awareness;
  private status: 'connected' | 'disconnected' | 'syncing' = 'disconnected';
  private unsubscribers: Array<() => void> = [];
  private binaryBytesSent = 0;
  private equivalentJsonBytes = 0;
  private isApplyingRemote = false;

  constructor(
    private doc: Y.Doc,
    private editor?: Editor | null,
    awareness?: Awareness
  ) {
    this.yShapes = this.doc.getMap<Uint8Array>('shapes-bin');
    this.awareness = awareness ?? new Awareness(this.doc);
  }

  /**
   * Starts bidirectional binary CRDT synchronization between Yjs and the canvas.
   * Optionally accepts callbacks for binary WebSocket transmission and remote shape updates.
   */
  public syncWithYjs(options?: {
    onBinaryUpdate?: (update: Uint8Array) => void;
    onAwarenessBinaryUpdate?: (update: Uint8Array) => void;
    onShapesChanged?: (shapes: CompactShapePayload[]) => void;
  }) {
    this.status = 'syncing';

    // 1. Emit compact binary Yjs CRDT update vectors on local mutations
    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return;
      this.binaryBytesSent += update.byteLength;
      options?.onBinaryUpdate?.(update);
    };
    this.doc.on('update', handleDocUpdate);
    this.unsubscribers.push(() => this.doc.off('update', handleDocUpdate));

    // 2. Observe Y.Map<Uint8Array> changes and decode binary payloads
    const handleMapChange = (event: Y.YMapEvent<Uint8Array>) => {
      if (event.transaction.origin === LOCAL_ORIGIN && !options?.onShapesChanged) {
        return;
      }

      const allShapes = this.getAllShapes();
      options?.onShapesChanged?.(allShapes);

      if (this.editor && event.transaction.origin !== LOCAL_ORIGIN) {
        this.applyRemoteToTldraw(event);
      }
    };
    this.yShapes.observe(handleMapChange);
    this.unsubscribers.push(() => this.yShapes.unobserve(handleMapChange));

    // 3. Emit compact binary awareness updates via y-protocols/awareness
    const handleAwarenessUpdate = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (origin === REMOTE_ORIGIN) return;
      const changedClients = [...added, ...updated, ...removed];
      if (changedClients.length === 0) return;
      const encoded = encodeAwarenessUpdate(this.awareness, changedClients);
      options?.onAwarenessBinaryUpdate?.(encoded);
    };
    this.awareness.on('update', handleAwarenessUpdate);
    this.unsubscribers.push(() => this.awareness.off('update', handleAwarenessUpdate));

    // 4. Listen to tldraw store mutations if an editor is attached
    if (this.editor && typeof this.editor.store?.listen === 'function') {
      const unlistenStore = this.editor.store.listen(
        (entry) => {
          if (this.isApplyingRemote) return;
          const added = Object.values(entry.changes.added ?? {});
          const updated = Object.values(entry.changes.updated ?? {}).map(([, to]) => to);
          const removed = Object.values(entry.changes.removed ?? {});

          this.doc.transact(() => {
            for (const record of [...added, ...updated]) {
              if (record && (record as { typeName?: string }).typeName === 'shape') {
                const payload = this.tldrawRecordToCompact(
                  record as unknown as Record<string, unknown>
                );
                if (payload) {
                  const jsonLen = new TextEncoder().encode(JSON.stringify(record)).byteLength;
                  this.equivalentJsonBytes += jsonLen;
                  this.yShapes.set(payload.id, encodeShapeBinary(payload));
                }
              }
            }
            for (const record of removed) {
              if (record && (record as { typeName?: string }).typeName === 'shape') {
                const id = String((record as { id?: string }).id ?? '');
                if (id) this.yShapes.delete(id);
              }
            }
          }, LOCAL_ORIGIN);
        },
        { source: 'user', scope: 'document' }
      );
      this.unsubscribers.push(unlistenStore);
    }

    this.status = 'connected';
  }

  /**
   * Upserts a shape, sticky note, or freehand path into the Yjs CRDT map as a compact binary buffer.
   */
  public upsertShape(shape: CompactShapePayload): Uint8Array {
    const encoded = encodeShapeBinary(shape);
    this.equivalentJsonBytes += new TextEncoder().encode(JSON.stringify(shape)).byteLength;
    this.doc.transact(() => {
      this.yShapes.set(shape.id, encoded);
    }, LOCAL_ORIGIN);
    return encoded;
  }

  /**
   * Deletes a shape by ID from the Yjs CRDT map.
   */
  public deleteShape(id: string): void {
    this.doc.transact(() => {
      this.yShapes.delete(id);
    }, LOCAL_ORIGIN);
  }

  /**
   * Decodes and returns all shapes currently stored in the Yjs CRDT map.
   */
  public getAllShapes(): CompactShapePayload[] {
    const result: CompactShapePayload[] = [];
    this.yShapes.forEach((binary) => {
      try {
        result.push(decodeShapeBinary(binary));
      } catch {
        // Skip corrupted entries
      }
    });
    return result;
  }

  /**
   * Encodes the full Yjs document state as a compact binary CRDT state vector update.
   */
  public encodeStateVectorUpdate(targetStateVector?: Uint8Array): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc, targetStateVector);
  }

  /**
   * Applies an incoming binary Yjs CRDT update vector without state rollback.
   */
  public applyRemoteUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.doc, update, REMOTE_ORIGIN);
  }

  /**
   * Applies an incoming binary y-protocols/awareness update.
   */
  public applyRemoteAwarenessUpdate(update: Uint8Array): void {
    applyAwarenessUpdate(this.awareness, update, REMOTE_ORIGIN);
  }

  /**
   * Updates local user cursor and selection in y-protocols/awareness.
   */
  public updateLocalPresence(state: Partial<AwarenessUserState>): void {
    const current = (this.awareness.getLocalState()?.user as AwarenessUserState | undefined) ?? {
      id: String(this.doc.clientID),
      name: 'Anonymous',
      color: '#38bdf8',
    };
    this.awareness.setLocalStateField('user', { ...current, ...state });
  }

  public getAwareness(): Awareness {
    return this.awareness;
  }

  public getStatus(): 'connected' | 'disconnected' | 'syncing' {
    return this.status;
  }

  public getBandwidthStats(): BandwidthStats {
    const reductionPercent =
      this.equivalentJsonBytes > 0
        ? Math.max(
            0,
            Number(
              (
                ((this.equivalentJsonBytes - this.binaryBytesSent) / this.equivalentJsonBytes) *
                100
              ).toFixed(2)
            )
          )
        : 0;
    return {
      binaryBytesSent: this.binaryBytesSent,
      equivalentJsonBytes: this.equivalentJsonBytes,
      reductionPercent,
    };
  }

  public destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.status = 'disconnected';
  }

  private tldrawRecordToCompact(record: Record<string, unknown>): CompactShapePayload | null {
    const id = String(record.id ?? '');
    if (!id) return null;
    const type = String(record.type ?? 'geo');
    const props = (record.props as Record<string, unknown>) ?? {};

    let kind: CompactShapePayload['kind'] = 'geo';
    if (type === 'note') kind = 'sticky';
    else if (type === 'draw') kind = 'freehand';

    const points: Array<{ x: number; y: number }> | undefined =
      kind === 'freehand' && Array.isArray(props.segments)
        ? (props.segments as Array<{ points?: Array<{ x: number; y: number }> }>).flatMap(
            (seg) => seg.points ?? []
          )
        : undefined;

    return {
      id,
      kind,
      x: Number(record.x ?? 0),
      y: Number(record.y ?? 0),
      w: typeof props.w === 'number' ? props.w : undefined,
      h: typeof props.h === 'number' ? props.h : undefined,
      rotation: typeof record.rotation === 'number' ? record.rotation : 0,
      color: typeof props.color === 'string' ? props.color : 'black',
      geo: typeof props.geo === 'string' ? props.geo : 'rectangle',
      text: typeof props.text === 'string' ? props.text : undefined,
      points,
    };
  }

  private applyRemoteToTldraw(event: Y.YMapEvent<Uint8Array>): void {
    if (!this.editor) return;
    this.isApplyingRemote = true;
    try {
      const toCreateOrUpdate: Array<Record<string, unknown>> = [];
      const toDelete: string[] = [];

      event.changes.keys.forEach((change, key) => {
        if (change.action === 'delete') {
          toDelete.push(key);
        } else {
          const bin = this.yShapes.get(key);
          if (!bin) return;
          const shape = decodeShapeBinary(bin);
          toCreateOrUpdate.push({
            id: shape.id,
            type: shape.kind === 'sticky' ? 'note' : shape.kind === 'freehand' ? 'draw' : 'geo',
            x: shape.x,
            y: shape.y,
            rotation: shape.rotation ?? 0,
            props:
              shape.kind === 'sticky'
                ? { text: shape.text ?? '', color: shape.color ?? 'yellow' }
                : {
                    geo: shape.geo ?? 'rectangle',
                    w: shape.w ?? 180,
                    h: shape.h ?? 120,
                    text: shape.text ?? '',
                    color: shape.color ?? 'blue',
                  },
          });
        }
      });

      if (toDelete.length > 0 && typeof this.editor.deleteShapes === 'function') {
        this.editor.deleteShapes(toDelete as never[]);
      }
      if (toCreateOrUpdate.length > 0 && typeof this.editor.createShapes === 'function') {
        this.editor.createShapes(toCreateOrUpdate as never[]);
      }
    } finally {
      this.isApplyingRemote = false;
    }
  }
}
