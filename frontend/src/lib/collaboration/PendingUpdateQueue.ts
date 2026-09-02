/**
 * PendingUpdateQueue
 *
 * Buffers local collaborative operations that were made while the WebSocket
 * provider was disconnected. On reconnect, every queued update is replayed
 * into the shared Y.Doc in the order it was enqueued, then the queue is
 * cleared.
 *
 * Design notes:
 *  - Each entry is an opaque `Uint8Array` (a Yjs encoded state-vector diff
 *    or a full document update) plus the wall-clock timestamp it was captured.
 *  - We use a content-hash to deduplicate identical byte sequences so that
 *    rapid offline edits that produce the same binary update are not applied
 *    twice.
 *  - The queue is capped at MAX_QUEUE_SIZE; once full the oldest entry is
 *    evicted so that memory pressure stays bounded.
 */

import * as Y from 'yjs';

export interface PendingUpdate {
  /** Yjs encoded document update (output of Y.encodeStateAsUpdate). */
  update: Uint8Array;
  /** Wall-clock ms when the update was captured. */
  capturedAt: number;
  /** Cheap dedup key derived from the first 16 bytes. */
  contentKey: string;
}

const MAX_QUEUE_SIZE = 100;

function deriveContentKey(update: Uint8Array): string {
  // Use first 16 bytes as a cheap hash for deduplication.
  return Array.from(update.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class PendingUpdateQueue {
  private queue: PendingUpdate[] = [];
  private seenKeys = new Set<string>();

  /** Number of updates currently in the queue. */
  get size(): number {
    return this.queue.length;
  }

  /** Returns a shallow copy of all pending updates in FIFO order. */
  get entries(): Readonly<PendingUpdate[]> {
    return [...this.queue];
  }

  /**
   * Enqueue a Yjs document update captured while offline.
   *
   * Duplicate updates (same content key) are silently dropped.
   * When the queue exceeds MAX_QUEUE_SIZE the oldest entry is evicted.
   */
  enqueue(update: Uint8Array): void {
    const contentKey = deriveContentKey(update);

    if (this.seenKeys.has(contentKey)) {
      return; // deduplicate
    }

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      const evicted = this.queue.shift();
      if (evicted) this.seenKeys.delete(evicted.contentKey);
    }

    this.queue.push({ update, capturedAt: Date.now(), contentKey });
    this.seenKeys.add(contentKey);
  }

  /**
   * Replay every queued update into `doc` in the order they were captured,
   * then clear the queue.
   *
   * Returns the number of updates that were applied.
   */
  replayInto(doc: Y.Doc): number {
    const pending = this.queue.splice(0);
    this.seenKeys.clear();

    let applied = 0;
    for (const entry of pending) {
      try {
        Y.applyUpdate(doc, entry.update);
        applied++;
      } catch (err) {
        // A malformed or already-applied update should not prevent the rest
        // from replaying.  Log a warning and continue.
        console.warn('[PendingUpdateQueue] Failed to replay update', err);
      }
    }

    return applied;
  }

  /** Discard all queued updates without applying them. */
  clear(): void {
    this.queue = [];
    this.seenKeys.clear();
  }
}
