/**
 * Anchor Merkle Root Job — Issue BE-009
 *
 * Periodically:
 *   1. verifies the audit hash chain end-to-end (refusing to anchor a chain
 *      that already fails verification — that raises the critical alarm);
 *   2. computes the Merkle root of every entry appended since the last anchor;
 *   3. publishes it on Stellar as the transaction's 32-byte `MEMO_HASH`
 *      (plus a `manageData` entry `w3sl_audit_root` holding the same bytes);
 *   4. records the anchor so later verifications can compare against it.
 *
 * `verifyPublishedAnchor()` fetches the transaction back from Horizon and
 * checks the on-chain memo against a fresh local recomputation.
 *
 * Environment:
 *   AUDIT_ANCHOR_SECRET          signing key (falls back to STELLAR_ISSUER_SECRET)
 *   AUDIT_ANCHOR_INTERVAL_MS     schedule interval (default 15 minutes)
 *   AUDIT_VERIFY_INTERVAL_MS     chain verification interval (default 5 minutes)
 *   STELLAR_HORIZON_URL / STELLAR_NETWORK ('public' | 'testnet')
 */

import { BASE_FEE, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { auditChainStore, type AuditAnchorRecord, type AuditChainStore } from '../db/auditChainStore.js';
import {
  tamperEvidentAuditService,
  type TamperEvidentAuditService,
} from '../services/tamperEvidentAuditService.js';
import logger from '../utils/logger.js';

export const ANCHOR_DATA_KEY = 'w3sl_audit_root';

export interface AnchorSubmitter {
  readonly network: string;
  /** Publish the 32-byte root on-chain; resolves to the transaction hash. */
  submit(merkleRootHex: string): Promise<string>;
  /** Fetch the root published by `txHash` (hex), or null if absent. */
  fetchPublishedRoot(txHash: string): Promise<string | null>;
}

export class StellarAnchorSubmitter implements AnchorSubmitter {
  readonly network: string;
  private readonly server: Horizon.Server;
  private readonly passphrase: string;

  constructor(
    private readonly secret = process.env.AUDIT_ANCHOR_SECRET || process.env.STELLAR_ISSUER_SECRET || '',
    horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  ) {
    const isPublic = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase() === 'public';
    this.network = isPublic ? 'public' : 'testnet';
    this.passphrase = isPublic ? Networks.PUBLIC : Networks.TESTNET;
    this.server = new Horizon.Server(horizonUrl);
  }

  async submit(merkleRootHex: string): Promise<string> {
    if (!this.secret) {
      throw new Error('AUDIT_ANCHOR_SECRET (or STELLAR_ISSUER_SECRET) is not configured');
    }
    const keypair = Keypair.fromSecret(this.secret);
    const account = await this.server.loadAccount(keypair.publicKey());
    const root = Buffer.from(merkleRootHex, 'hex');

    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.passphrase })
      .addOperation(Operation.manageData({ name: ANCHOR_DATA_KEY, value: root }))
      .addMemo(Memo.hash(root))
      .setTimeout(60)
      .build();
    tx.sign(keypair);

    const response = await this.server.submitTransaction(tx);
    return response.hash;
  }

  async fetchPublishedRoot(txHash: string): Promise<string | null> {
    const tx = await this.server.transactions().transaction(txHash).call();
    if (tx.memo_type !== 'hash' || !tx.memo) return null;
    return Buffer.from(tx.memo, 'base64').toString('hex');
  }
}

export interface AnchorJobDeps {
  service?: TamperEvidentAuditService;
  store?: AuditChainStore;
  submitter?: AnchorSubmitter;
}

export type AnchorJobResult =
  | { status: 'skipped'; reason: string }
  | { status: 'anchored'; anchor: AuditAnchorRecord }
  | { status: 'failed'; reason: string; anchor?: AuditAnchorRecord };

let defaultSubmitter: AnchorSubmitter | null = null;
function getDefaultSubmitter(): AnchorSubmitter {
  defaultSubmitter ??= new StellarAnchorSubmitter();
  return defaultSubmitter;
}

/** Anchor every entry appended since the previous anchor. */
export async function runAnchorMerkleRootJob(deps: AnchorJobDeps = {}): Promise<AnchorJobResult> {
  const service = deps.service ?? tamperEvidentAuditService;
  const store = deps.store ?? auditChainStore;
  const submitter = deps.submitter ?? getDefaultSubmitter();

  const verification = await service.verifyChain();
  if (!verification.valid) {
    return { status: 'failed', reason: 'Audit chain failed verification; refusing to anchor a tampered chain' };
  }

  const head = await store.getHead();
  const previous = await store.getLatestAnchor();
  const fromSequence = previous ? previous.toSequence + 1n : 1n;

  if (!head || head.sequence < fromSequence) {
    return { status: 'skipped', reason: 'No new audit entries since the last anchor' };
  }

  const { root, count } = await service.computeRangeRoot(fromSequence, head.sequence);
  const anchor = await store.createAnchor({
    fromSequence,
    toSequence: head.sequence,
    entryCount: count,
    merkleRoot: root,
    headHash: head.entryHash,
    network: submitter.network,
  });

  try {
    const txHash = await submitter.submit(root);
    const anchored = await store.updateAnchor(anchor.id, { txHash, status: 'anchored', anchoredAt: new Date() });
    logger.info('Audit chain Merkle root anchored on Stellar', {
      fromSequence: fromSequence.toString(),
      toSequence: head.sequence.toString(),
      merkleRoot: root,
      txHash,
    });
    return { status: 'anchored', anchor: anchored };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const failed = await store.updateAnchor(anchor.id, { status: 'failed', error: reason.slice(0, 500) });
    logger.error('Failed to anchor audit chain Merkle root', { reason, anchorId: anchor.id });
    return { status: 'failed', reason, anchor: failed };
  }
}

export interface AnchorVerification {
  anchorId: string;
  txHash: string | null;
  localRoot: string;
  storedRoot: string;
  publishedRoot: string | null;
  matches: boolean;
}

/** Confirm the root published on Stellar equals a fresh local computation. */
export async function verifyPublishedAnchor(
  anchor: AuditAnchorRecord,
  deps: Omit<AnchorJobDeps, 'store'> = {},
): Promise<AnchorVerification> {
  const service = deps.service ?? tamperEvidentAuditService;
  const submitter = deps.submitter ?? getDefaultSubmitter();

  const { root: localRoot } = await service.computeRangeRoot(anchor.fromSequence, anchor.toSequence);
  const publishedRoot = anchor.txHash ? await submitter.fetchPublishedRoot(anchor.txHash) : null;

  return {
    anchorId: anchor.id,
    txHash: anchor.txHash,
    localRoot,
    storedRoot: anchor.merkleRoot,
    publishedRoot,
    matches: publishedRoot !== null && publishedRoot === localRoot && localRoot === anchor.merkleRoot,
  };
}

/**
 * Start the in-process schedulers: routine chain verification and periodic
 * anchoring. Returns a stop function. Timers are unref'd so they never keep
 * the process alive on shutdown.
 */
export function startAuditChainJobs(deps: AnchorJobDeps = {}): () => void {
  const service = deps.service ?? tamperEvidentAuditService;
  const anchorEveryMs = Number(process.env.AUDIT_ANCHOR_INTERVAL_MS || 15 * 60_000);
  const verifyEveryMs = Number(process.env.AUDIT_VERIFY_INTERVAL_MS || 5 * 60_000);

  let anchoring = false;
  const anchorTimer = setInterval(() => {
    if (anchoring) return;
    anchoring = true;
    runAnchorMerkleRootJob(deps)
      .catch((error) => logger.error('Audit anchor job crashed', { error: String(error) }))
      .finally(() => {
        anchoring = false;
      });
  }, anchorEveryMs);

  let verifying = false;
  const verifyTimer = setInterval(() => {
    if (verifying) return;
    verifying = true;
    service
      .verifyChain()
      .then((result) =>
        logger.info('Audit chain verification completed', {
          valid: result.valid,
          entriesChecked: result.entriesChecked,
          durationMs: result.durationMs,
        }),
      )
      .catch((error) => logger.error('Audit chain verification crashed', { error: String(error) }))
      .finally(() => {
        verifying = false;
      });
  }, verifyEveryMs);

  anchorTimer.unref();
  verifyTimer.unref();

  return () => {
    clearInterval(anchorTimer);
    clearInterval(verifyTimer);
  };
}
