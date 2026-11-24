import redisClient from '../utils/redis.js';

export interface CheckpointStats {
  streamKey: string;
  cursor: string | null;
  ledgerSeq: number;
  lastUpdated: number;
  totalProcessed: number;
}

/**
 * High-performance cursor checkpoint manager backed by Redis with in-memory fallback.
 * Time Complexity: O(1) for save and retrieve operations.
 * Space Complexity: O(1) per indexed stream.
 */
export class CheckpointManager {
  private keyPrefix: string;
  private memoryFallback: Map<string, { cursor: string; ledgerSeq: number; lastUpdated: number; totalProcessed: number }>;

  constructor(keyPrefix: string = 'indexer:checkpoint:') {
    this.keyPrefix = keyPrefix;
    this.memoryFallback = new Map();
  }

  private formatKey(streamKey: string): string {
    return `${this.keyPrefix}${streamKey}`;
  }

  /**
   * Retrieves the last committed cursor for a given stream.
   * Time Complexity: O(1).
   */
  async getCursor(streamKey: string): Promise<string | null> {
    try {
      const key = this.formatKey(streamKey);
      const data = await redisClient.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        return parsed.cursor ?? null;
      }
    } catch {
      // Fall through to in-memory fallback
    }

    const fallback = this.memoryFallback.get(streamKey);
    return fallback ? fallback.cursor : null;
  }

  /**
   * Commits a checkpoint batch with current cursor, ledger sequence, and processed count.
   * Time Complexity: O(1).
   */
  async commitBatchCheckpoint(
    streamKey: string,
    cursor: string,
    ledgerSeq: number = 0,
    processedBatchCount: number = 0
  ): Promise<void> {
    const key = this.formatKey(streamKey);
    const existingFallback = this.memoryFallback.get(streamKey);
    const totalProcessed = (existingFallback?.totalProcessed || 0) + processedBatchCount;
    const now = Date.now();

    const payload = {
      streamKey,
      cursor,
      ledgerSeq,
      lastUpdated: now,
      totalProcessed,
    };

    this.memoryFallback.set(streamKey, payload);

    try {
      await redisClient.set(key, JSON.stringify(payload));
    } catch {
      // Log or continue with memory fallback
    }
  }

  /**
   * Saves cursor directly.
   * Time Complexity: O(1).
   */
  async saveCursor(streamKey: string, cursor: string, ledgerSeq: number = 0): Promise<void> {
    return this.commitBatchCheckpoint(streamKey, cursor, ledgerSeq, 0);
  }

  /**
   * Retrieves full checkpoint statistics for monitoring lag and health.
   * Time Complexity: O(1).
   */
  async getCheckpointStats(streamKey: string): Promise<CheckpointStats> {
    try {
      const key = this.formatKey(streamKey);
      const data = await redisClient.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        return {
          streamKey,
          cursor: parsed.cursor ?? null,
          ledgerSeq: parsed.ledgerSeq ?? 0,
          lastUpdated: parsed.lastUpdated ?? Date.now(),
          totalProcessed: parsed.totalProcessed ?? 0,
        };
      }
    } catch {
      // Fallback
    }

    const fallback = this.memoryFallback.get(streamKey);
    return {
      streamKey,
      cursor: fallback?.cursor ?? null,
      ledgerSeq: fallback?.ledgerSeq ?? 0,
      lastUpdated: fallback?.lastUpdated ?? Date.now(),
      totalProcessed: fallback?.totalProcessed ?? 0,
    };
  }

  /**
   * Resets checkpoint (useful for testing or full re-indexing).
   */
  async reset(streamKey: string): Promise<void> {
    this.memoryFallback.delete(streamKey);
    try {
      await redisClient.del(this.formatKey(streamKey));
    } catch {
      // noop
    }
  }
}

export const defaultCheckpointManager = new CheckpointManager();
export default CheckpointManager;
