/**
 * Audit Chain Store — Issue BE-009
 *
 * Persistence for the tamper-evident audit hash chain (`audit_chain_entries`)
 * and the Merkle roots anchored on Stellar (`audit_chain_anchors`).
 *
 * Appends are serialised with a PostgreSQL transaction-scoped advisory lock so
 * that concurrent writers (multiple API instances) always link to the true
 * chain head: read head → build entry → insert all happen under the lock.
 * Sequences are assigned by the application (head + 1), never by a database
 * sequence, so a deleted row always leaves a detectable gap.
 *
 * An in-memory implementation is provided for tests and local development.
 */

import prisma from './index.js';

export interface AuditChainRecord {
  sequence: bigint;
  eventType: string;
  actorId: string | null;
  entity: string | null;
  entityId: string | null;
  payload: unknown;
  prevHash: string;
  entryHash: string;
  createdAt: Date;
}

export type AnchorStatus = 'pending' | 'anchored' | 'failed';

export interface AuditAnchorRecord {
  id: string;
  fromSequence: bigint;
  toSequence: bigint;
  entryCount: number;
  merkleRoot: string;
  headHash: string;
  network: string;
  txHash: string | null;
  status: AnchorStatus;
  error: string | null;
  createdAt: Date;
  anchoredAt: Date | null;
}

export type NewAnchor = Pick<
  AuditAnchorRecord,
  'fromSequence' | 'toSequence' | 'entryCount' | 'merkleRoot' | 'headHash' | 'network'
>;

export interface AuditChainStore {
  /**
   * Append one entry atomically. `build` receives the current head (or null
   * for an empty chain) and returns the fully-hashed record to insert.
   */
  append(build: (head: AuditChainRecord | null) => AuditChainRecord): Promise<AuditChainRecord>;
  getHead(): Promise<AuditChainRecord | null>;
  getEntry(sequence: bigint): Promise<AuditChainRecord | null>;
  /** Entries with `sequence > afterSequence`, ascending, at most `limit`. */
  readBatch(afterSequence: bigint, limit: number): Promise<AuditChainRecord[]>;
  /** Entry hashes in `[fromSequence, toSequence]`, ascending by sequence. */
  readHashes(fromSequence: bigint, toSequence: bigint): Promise<Array<{ sequence: bigint; entryHash: string }>>;

  createAnchor(anchor: NewAnchor): Promise<AuditAnchorRecord>;
  updateAnchor(
    id: string,
    patch: Partial<Pick<AuditAnchorRecord, 'txHash' | 'status' | 'error' | 'anchoredAt'>>,
  ): Promise<AuditAnchorRecord>;
  getAnchor(id: string): Promise<AuditAnchorRecord | null>;
  /** Latest successfully anchored range. */
  getLatestAnchor(): Promise<AuditAnchorRecord | null>;
  listAnchors(limit: number): Promise<AuditAnchorRecord[]>;
}

const CHAIN_LOCK_KEY = 'audit_chain_entries';

// Prisma's generated delegates are reached through `any` so this module does
// not depend on the regenerated client shape at type-check time.
const db = prisma as any;

function toAnchor(row: any): AuditAnchorRecord {
  return { ...row, status: row.status as AnchorStatus };
}

export class PrismaAuditChainStore implements AuditChainStore {
  async append(build: (head: AuditChainRecord | null) => AuditChainRecord): Promise<AuditChainRecord> {
    return db.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', CHAIN_LOCK_KEY);
      const head: AuditChainRecord | null = await tx.auditChainEntry.findFirst({ orderBy: { sequence: 'desc' } });
      const entry = build(head);
      return tx.auditChainEntry.create({ data: entry });
    });
  }

  getHead(): Promise<AuditChainRecord | null> {
    return db.auditChainEntry.findFirst({ orderBy: { sequence: 'desc' } });
  }

  getEntry(sequence: bigint): Promise<AuditChainRecord | null> {
    return db.auditChainEntry.findUnique({ where: { sequence } });
  }

  readBatch(afterSequence: bigint, limit: number): Promise<AuditChainRecord[]> {
    return db.auditChainEntry.findMany({
      where: { sequence: { gt: afterSequence } },
      orderBy: { sequence: 'asc' },
      take: limit,
    });
  }

  readHashes(fromSequence: bigint, toSequence: bigint): Promise<Array<{ sequence: bigint; entryHash: string }>> {
    return db.auditChainEntry.findMany({
      where: { sequence: { gte: fromSequence, lte: toSequence } },
      orderBy: { sequence: 'asc' },
      select: { sequence: true, entryHash: true },
    });
  }

  async createAnchor(anchor: NewAnchor): Promise<AuditAnchorRecord> {
    return toAnchor(await db.auditChainAnchor.create({ data: { ...anchor, status: 'pending' } }));
  }

  async updateAnchor(
    id: string,
    patch: Partial<Pick<AuditAnchorRecord, 'txHash' | 'status' | 'error' | 'anchoredAt'>>,
  ): Promise<AuditAnchorRecord> {
    return toAnchor(await db.auditChainAnchor.update({ where: { id }, data: patch }));
  }

  async getAnchor(id: string): Promise<AuditAnchorRecord | null> {
    const row = await db.auditChainAnchor.findUnique({ where: { id } });
    return row ? toAnchor(row) : null;
  }

  async getLatestAnchor(): Promise<AuditAnchorRecord | null> {
    const row = await db.auditChainAnchor.findFirst({
      where: { status: 'anchored' },
      orderBy: { toSequence: 'desc' },
    });
    return row ? toAnchor(row) : null;
  }

  async listAnchors(limit: number): Promise<AuditAnchorRecord[]> {
    const rows = await db.auditChainAnchor.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map(toAnchor);
  }
}

export class InMemoryAuditChainStore implements AuditChainStore {
  readonly entries: AuditChainRecord[] = [];
  readonly anchors: AuditAnchorRecord[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  append(build: (head: AuditChainRecord | null) => AuditChainRecord): Promise<AuditChainRecord> {
    // Serialise appends the same way the advisory lock does in PostgreSQL.
    const run = this.queue.then(() => {
      const entry = build(this.entries[this.entries.length - 1] ?? null);
      this.entries.push({ ...entry });
      return entry;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async getHead(): Promise<AuditChainRecord | null> {
    return this.entries[this.entries.length - 1] ?? null;
  }

  async getEntry(sequence: bigint): Promise<AuditChainRecord | null> {
    return this.entries.find((e) => e.sequence === sequence) ?? null;
  }

  async readBatch(afterSequence: bigint, limit: number): Promise<AuditChainRecord[]> {
    return this.entries
      .filter((e) => e.sequence > afterSequence)
      .sort((a, b) => (a.sequence < b.sequence ? -1 : 1))
      .slice(0, limit);
  }

  async readHashes(fromSequence: bigint, toSequence: bigint): Promise<Array<{ sequence: bigint; entryHash: string }>> {
    return this.entries
      .filter((e) => e.sequence >= fromSequence && e.sequence <= toSequence)
      .sort((a, b) => (a.sequence < b.sequence ? -1 : 1))
      .map(({ sequence, entryHash }) => ({ sequence, entryHash }));
  }

  async createAnchor(anchor: NewAnchor): Promise<AuditAnchorRecord> {
    const record: AuditAnchorRecord = {
      ...anchor,
      id: `anchor-${this.anchors.length + 1}`,
      txHash: null,
      status: 'pending',
      error: null,
      createdAt: new Date(),
      anchoredAt: null,
    };
    this.anchors.push(record);
    return record;
  }

  async updateAnchor(
    id: string,
    patch: Partial<Pick<AuditAnchorRecord, 'txHash' | 'status' | 'error' | 'anchoredAt'>>,
  ): Promise<AuditAnchorRecord> {
    const anchor = this.anchors.find((a) => a.id === id);
    if (!anchor) throw new Error(`Unknown anchor ${id}`);
    Object.assign(anchor, patch);
    return anchor;
  }

  async getAnchor(id: string): Promise<AuditAnchorRecord | null> {
    return this.anchors.find((a) => a.id === id) ?? null;
  }

  async getLatestAnchor(): Promise<AuditAnchorRecord | null> {
    return (
      this.anchors
        .filter((a) => a.status === 'anchored')
        .sort((a, b) => (a.toSequence < b.toSequence ? 1 : -1))[0] ?? null
    );
  }

  async listAnchors(limit: number): Promise<AuditAnchorRecord[]> {
    return [...this.anchors].reverse().slice(0, limit);
  }
}

export const auditChainStore: AuditChainStore = new PrismaAuditChainStore();
