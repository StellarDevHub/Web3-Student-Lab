import redisClient from '../utils/redis.js';

export interface IngestedEvent {
  id: string; // Composite key: ${txHash}:${opIndex}
  txHash: string;
  opIndex: number;
  ledger: number;
  contractId?: string;
  topic?: string[];
  value?: any;
  pagingToken: string;
  timestamp: number;
}

export interface EventQueryFilter {
  contractId?: string;
  txHash?: string;
  fromLedger?: number;
  toLedger?: number;
  limit?: number;
}

/**
 * High-Throughput Event Deduplication and Ingestion Store.
 * Uses in-memory LRU ring set + Redis SETNX for O(1) deduplication check.
 * Space Complexity: O(M) where M is the deduplication cache capacity (default 50,000 keys).
 */
export class EventStore {
  private dedupeCache: Set<string>;
  private dedupeQueue: string[];
  private maxCacheSize: number;
  private events: Map<string, IngestedEvent>;

  constructor(maxCacheSize: number = 50000) {
    this.maxCacheSize = maxCacheSize;
    this.dedupeCache = new Set();
    this.dedupeQueue = [];
    this.events = new Map();
  }

  /**
   * Generates canonical deduplication key for transaction hash and operation index.
   */
  public getDedupeKey(txHash: string, opIndex: number): string {
    return `${txHash}:${opIndex}`;
  }

  /**
   * Checks if an event is a duplicate.
   * Time Complexity: O(1).
   */
  async isDuplicate(txHash: string, opIndex: number): Promise<boolean> {
    const key = this.getDedupeKey(txHash, opIndex);
    if (this.dedupeCache.has(key)) {
      return true;
    }

    try {
      const redisKey = `dedupe:event:${key}`;
      const result = await redisClient.set(redisKey, '1', 'EX', 86400, 'NX');
      // If NX returned null, key already existed in Redis
      if (result === null) {
        this.addToLocalCache(key);
        return true;
      }
    } catch {
      // In case Redis is unavailable, rely on local cache
    }

    return false;
  }

  private addToLocalCache(key: string): void {
    if (this.dedupeCache.has(key)) return;

    if (this.dedupeQueue.length >= this.maxCacheSize) {
      const oldest = this.dedupeQueue.shift();
      if (oldest) this.dedupeCache.delete(oldest);
    }

    this.dedupeCache.add(key);
    this.dedupeQueue.push(key);
  }

  /**
   * High-throughput batch insertion with automatic deduplication.
   * Time Complexity: O(B) where B is batch size.
   * Space Complexity: O(B).
   */
  async insertBatch(
    events: IngestedEvent[]
  ): Promise<{ inserted: number; duplicates: number }> {
    let inserted = 0;
    let duplicates = 0;

    for (const evt of events) {
      const key = this.getDedupeKey(evt.txHash, evt.opIndex);
      const isDup = await this.isDuplicate(evt.txHash, evt.opIndex);

      if (isDup) {
        duplicates++;
        continue;
      }

      this.addToLocalCache(key);
      this.events.set(evt.id, evt);
      inserted++;

      // Prevent unbounded growth of in-memory store in long-running processes
      if (this.events.size > this.maxCacheSize * 2) {
        const firstKey = this.events.keys().next().value;
        if (firstKey) this.events.delete(firstKey);
      }
    }

    return { inserted, duplicates };
  }

  /**
   * Inserts single event.
   * Time Complexity: O(1).
   */
  async insert(event: IngestedEvent): Promise<boolean> {
    const res = await this.insertBatch([event]);
    return res.inserted === 1;
  }

  /**
   * Queries stored events with filtering.
   */
  async queryEvents(filter: EventQueryFilter = {}): Promise<IngestedEvent[]> {
    const { contractId, txHash, fromLedger, toLedger, limit = 50 } = filter;
    const results: IngestedEvent[] = [];

    for (const evt of this.events.values()) {
      if (contractId && evt.contractId !== contractId) continue;
      if (txHash && evt.txHash !== txHash) continue;
      if (fromLedger !== undefined && evt.ledger < fromLedger) continue;
      if (toLedger !== undefined && evt.ledger > toLedger) continue;

      results.push(evt);
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Returns total events count in memory.
   */
  getStoredCount(): number {
    return this.events.size;
  }

  /**
   * Clears all stored data (for tests).
   */
  clear(): void {
    this.dedupeCache.clear();
    this.dedupeQueue = [];
    this.events.clear();
  }
}

export const defaultEventStore = new EventStore();
export default EventStore;
