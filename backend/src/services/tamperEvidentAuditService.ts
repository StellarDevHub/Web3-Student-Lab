/**
 * Tamper-Evident Audit Service — Issue BE-009
 *
 * Append-only audit log in which every entry commits to its predecessor:
 *
 *   entryHash = SHA-256( prevHash ‖ canonicalJSON(sequence, eventType, actorId,
 *                                                  entity, entityId, payload, createdAt) )
 *
 * The first entry links to the all-zero genesis hash. Any change to a stored
 * row — editing a field, deleting a row, re-ordering, or truncating the tail —
 * breaks recomputation during `verifyChain()`, which then raises a CRITICAL
 * alarm (structured log, Sentry, `tamper` event and optional webhook).
 *
 * Merkle roots over ranges of entry hashes are anchored on Stellar by
 * `jobs/anchorMerkleRootJob.ts`; `verifyChain()` also checks that the latest
 * anchored range still exists and still hashes to the published root, which
 * catches an attacker who rewrites the whole chain consistently.
 *
 * Verification streams the chain in batches and does one SHA-256 per entry,
 * comfortably under 1s per 10,000 entries.
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { auditChainStore, type AuditAnchorRecord, type AuditChainRecord, type AuditChainStore } from '../db/auditChainStore.js';
import logger from '../utils/logger.js';
import { captureMessage } from '../utils/sentry.js';

export const GENESIS_HASH = '0'.repeat(64);

export interface AuditEventInput {
  eventType: string;
  actorId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  payload?: unknown;
}

export type TamperKind = 'HASH_MISMATCH' | 'CHAIN_BREAK' | 'SEQUENCE_GAP' | 'ANCHOR_MISMATCH' | 'TRUNCATED';

export interface TamperFinding {
  kind: TamperKind;
  sequence: string;
  message: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  entriesChecked: number;
  headSequence: string | null;
  headHash: string | null;
  durationMs: number;
  findings: TamperFinding[];
}

export interface VerifyOptions {
  batchSize?: number;
  /** Stop after this many findings (default 100). */
  maxFindings?: number;
  /** Raise the critical alarm on failure (default true). */
  alarm?: boolean;
}

// ─── Hashing primitives ──────────────────────────────────────────────────────

/** Deterministic JSON: object keys sorted recursively, `undefined` dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function computeEntryHash(entry: Omit<AuditChainRecord, 'entryHash'>): string {
  const body = canonicalJson({
    sequence: entry.sequence.toString(),
    eventType: entry.eventType,
    actorId: entry.actorId,
    entity: entry.entity,
    entityId: entry.entityId,
    payload: entry.payload,
    createdAt: entry.createdAt.toISOString(),
  });
  return sha256Hex(`${entry.prevHash}${body}`);
}

/**
 * Binary Merkle root over hex SHA-256 leaves. Parents are
 * SHA-256(left ‖ right) over the raw 32-byte digests; an odd node at any level
 * is paired with itself. Returns the genesis hash for an empty list.
 */
export function computeMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) return GENESIS_HASH;

  let level = leafHashes.map((h) => Buffer.from(h, 'hex'));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(createHash('sha256').update(left).update(right).digest());
    }
    level = next;
  }
  return level[0]!.toString('hex');
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class TamperEvidentAuditService extends EventEmitter {
  /** Highest sequence this process has appended — a witness against tail truncation. */
  private highestAppended = 0n;

  constructor(private readonly store: AuditChainStore = auditChainStore) {
    super();
  }

  /** Append an event to the chain. */
  async record(event: AuditEventInput): Promise<AuditChainRecord> {
    const entry = await this.store.append((head) => {
      const base = {
        sequence: head ? head.sequence + 1n : 1n,
        eventType: event.eventType,
        actorId: event.actorId ?? null,
        entity: event.entity ?? null,
        entityId: event.entityId ?? null,
        // Normalise through JSON so the hashed value equals what JSONB returns.
        payload: JSON.parse(JSON.stringify(event.payload ?? {})),
        prevHash: head ? head.entryHash : GENESIS_HASH,
        createdAt: new Date(),
      };
      return { ...base, entryHash: computeEntryHash(base) };
    });
    if (entry.sequence > this.highestAppended) this.highestAppended = entry.sequence;
    return entry;
  }

  /**
   * Walk the whole chain and confirm continuity. Detects modified rows
   * (hash mismatch), deleted / inserted rows (sequence gap, broken link) and
   * tail truncation or wholesale rewrites (against the latest Stellar anchor).
   */
  async verifyChain(options: VerifyOptions = {}): Promise<ChainVerificationResult> {
    const batchSize = options.batchSize ?? 5_000;
    const maxFindings = options.maxFindings ?? 100;
    const started = performance.now();
    const findings: TamperFinding[] = [];

    let expectedSequence = 1n;
    let prevHash = GENESIS_HASH;
    let last: AuditChainRecord | null = null;
    let checked = 0;

    for (;;) {
      const batch = await this.store.readBatch(last ? last.sequence : 0n, batchSize);
      if (batch.length === 0) break;

      for (const entry of batch) {
        checked += 1;
        if (entry.sequence !== expectedSequence) {
          findings.push({
            kind: 'SEQUENCE_GAP',
            sequence: entry.sequence.toString(),
            message: `Expected sequence ${expectedSequence}, found ${entry.sequence} — rows deleted or inserted`,
          });
        }
        if (entry.prevHash !== prevHash) {
          findings.push({
            kind: 'CHAIN_BREAK',
            sequence: entry.sequence.toString(),
            message: 'prevHash does not match the preceding entry hash',
          });
        }
        if (computeEntryHash(entry) !== entry.entryHash) {
          findings.push({
            kind: 'HASH_MISMATCH',
            sequence: entry.sequence.toString(),
            message: 'Entry content does not match its stored hash — row modified',
          });
        }

        expectedSequence = entry.sequence + 1n;
        prevHash = entry.entryHash;
        last = entry;
        if (findings.length >= maxFindings) break;
      }
      if (findings.length >= maxFindings || batch.length < batchSize) break;
    }

    const headSequence = last ? last.sequence : 0n;
    if (findings.length < maxFindings && headSequence < this.highestAppended) {
      findings.push({
        kind: 'TRUNCATED',
        sequence: this.highestAppended.toString(),
        message: `Chain ends at ${headSequence} but this instance appended up to ${this.highestAppended}`,
      });
    }
    if (findings.length < maxFindings) {
      findings.push(...(await this.checkLatestAnchor(last)));
    }

    const result: ChainVerificationResult = {
      valid: findings.length === 0,
      entriesChecked: checked,
      headSequence: last ? last.sequence.toString() : null,
      headHash: last ? last.entryHash : null,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      findings,
    };

    if (!result.valid && options.alarm !== false) {
      await this.raiseAlarm(result);
    }
    return result;
  }

  /** Merkle root over the entry hashes of `[fromSequence, toSequence]`. */
  async computeRangeRoot(fromSequence: bigint, toSequence: bigint): Promise<{ root: string; count: number }> {
    const rows = await this.store.readHashes(fromSequence, toSequence);
    return { root: computeMerkleRoot(rows.map((r) => r.entryHash)), count: rows.length };
  }

  /** Recompute an anchor's range locally and compare with the stored root. */
  async verifyAnchorLocally(anchor: AuditAnchorRecord): Promise<boolean> {
    const { root, count } = await this.computeRangeRoot(anchor.fromSequence, anchor.toSequence);
    return root === anchor.merkleRoot && count === anchor.entryCount;
  }

  private async checkLatestAnchor(last: AuditChainRecord | null): Promise<TamperFinding[]> {
    const anchor = await this.store.getLatestAnchor();
    if (!anchor) return [];

    if (!last || last.sequence < anchor.toSequence) {
      return [
        {
          kind: 'TRUNCATED',
          sequence: anchor.toSequence.toString(),
          message: `Chain ends at ${last?.sequence ?? 0} but entries up to ${anchor.toSequence} were anchored on Stellar`,
        },
      ];
    }

    if (!(await this.verifyAnchorLocally(anchor))) {
      return [
        {
          kind: 'ANCHOR_MISMATCH',
          sequence: anchor.toSequence.toString(),
          message: `Entries ${anchor.fromSequence}-${anchor.toSequence} no longer match the Merkle root anchored in tx ${anchor.txHash}`,
        },
      ];
    }
    return [];
  }

  private async raiseAlarm(result: ChainVerificationResult): Promise<void> {
    const summary = {
      severity: 'CRITICAL',
      alarm: 'AUDIT_CHAIN_TAMPERED',
      findings: result.findings.slice(0, 10),
      totalFindings: result.findings.length,
      headSequence: result.headSequence,
    };

    logger.error('CRITICAL: audit hash chain verification failed — possible tampering', summary);
    captureMessage('Audit hash chain tampering detected', 'error', summary);
    this.emit('tamper', result);

    const webhook = process.env.AUDIT_ALARM_WEBHOOK_URL;
    if (webhook) {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'CRITICAL: audit hash chain tampering detected', ...summary }),
          signal: AbortSignal.timeout(5_000),
        });
      } catch (error) {
        logger.error('Failed to deliver audit tamper alarm webhook', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export const tamperEvidentAuditService = new TamperEvidentAuditService();
