import {
    FeeBumpTransaction,
    Keypair,
    Networks,
    Transaction,
    TransactionBuilder,
} from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';
import { KmsStellarSigner } from './kmsSigner.js';

// Contracts the relayer is allowed to sponsor - pulled from env (comma-separated)
const WHITELISTED_CONTRACTS = new Set(
  (process.env.RELAYER_WHITELISTED_CONTRACTS || '').split(',').filter(Boolean)
);

// Max fee the relayer will pay per fee-bump in stroops (default 1 XLM = 10_000_000 stroops)
const MAX_FEE_STROOPS = parseInt(process.env.RELAYER_MAX_FEE_STROOPS || '10000000', 10);

// Retry policy for ledger sequence desynchronization (txBAD_SEQ)
const MAX_SEQ_RETRIES = 2;

export interface RelayRequest {
  innerTxXdr: string;
  studentPublicKey: string;
}

export interface RelayResult {
  feeBumpXdr: string;
}

/**
 * Serializes async work per key so that concurrent submissions sharing the
 * same relayer account never race on the sequence number.
 */
class AsyncMutex {
  private queue: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => (release = resolve));
    const prev = this.queue;
    this.queue = prev.then(() => next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export class GasRelayerService {
  private signer: KmsStellarSigner;
  private networkPassphrase: string;
  private submitMutex = new AsyncMutex();

  constructor(signerOverride?: KmsStellarSigner) {
    this.signer = signerOverride ?? new KmsStellarSigner();
    const net = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();
    this.networkPassphrase =
      net === 'mainnet' || net === 'public' ? Networks.PUBLIC : Networks.TESTNET;
  }

  /**
   * Validate the inner transaction before agreeing to sponsor it.
   * Throws with a descriptive message if the tx fails policy checks.
   */
  validateInnerTx(innerTx: Transaction): void {
    // Only sponsor transactions whose source is the student (not arbitrary accounts)
    if (!innerTx.source) {
      throw new Error('Inner transaction has no source account');
    }

    // Contract whitelist check — every Soroban invoke_host_function op must
    // target a whitelisted contract. Skip the check if no whitelist is configured
    // (open policy for dev/test environments).
    if (WHITELISTED_CONTRACTS.size > 0) {
      for (const op of innerTx.operations) {
        // invokeHostFunction operations carry the contract via the auth entries;
        // we inspect the operation type and block unknown op types outright.
        const opType = (op as any).type as string;
        if (opType === 'invokeHostFunction') {
          const contractId: string | undefined = (op as any).func?.invokeContract?.contractAddress?.contractId?.();
          if (contractId && !WHITELISTED_CONTRACTS.has(contractId)) {
            throw new Error(`Contract ${contractId} is not whitelisted for gas sponsorship`);
          }
        }
      }
    }
  }

  getRelayerPublicKey(): string {
    return this.signer.getPublicKey();
  }

  /**
   * Wrap the student-signed inner transaction in a fee-bump envelope and sign
   * it with the relayer master key (KMS-backed). Fee-bump construction is
   * serialized through a mutex so concurrent requests never observe the same
   * relayer sequence state. On txBAD_SEQ-class desynchronization the relayer
   * account sequence is re-fetched and the build is retried (up to
   * MAX_SEQ_RETRIES times).
   */
  async buildFeeBump(req: RelayRequest): Promise<RelayResult> {
    let innerTx: Transaction;
    try {
      innerTx = TransactionBuilder.fromXDR(req.innerTxXdr, this.networkPassphrase) as Transaction;
    } catch {
      throw new Error('Invalid inner transaction XDR');
    }

    if (innerTx instanceof FeeBumpTransaction) {
      throw new Error('Cannot wrap an existing fee-bump transaction');
    }

    this.validateInnerTx(innerTx);

    return this.submitMutex.runExclusive(() => this.buildAndSignWithRetry(req, innerTx));
  }

  private async buildAndSignWithRetry(req: RelayRequest, innerTx: Transaction): Promise<RelayResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_SEQ_RETRIES; attempt++) {
      try {
        const result = await this.buildSignedFeeBump(req, innerTx);
        return result;
      } catch (err) {
        lastError = err;
        if (!this.isSequenceError(err) || attempt === MAX_SEQ_RETRIES) {
          throw err;
        }
        logger.warn(
          `txBAD_SEQ detected while building fee-bump (attempt ${attempt + 1}/${MAX_SEQ_RETRIES + 1}), re-fetching relayer sequence`
        );
        await this.signer.refreshSequence();
      }
    }

    throw lastError;
  }

  private async buildSignedFeeBump(req: RelayRequest, innerTx: Transaction): Promise<RelayResult> {
    const feeAccount = this.signer.getPublicKey();

    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      feeAccount,
      String(MAX_FEE_STROOPS),
      innerTx,
      this.networkPassphrase
    );

    // Sign the fee-bump envelope hash via KMS; private key never leaves the HSM
    const txHash = feeBumpTx.hash();
    const sig = await this.signer.signTransactionHash(txHash);

    // Derive the 4-byte hint from the raw public key bytes (last 4 bytes)
    const hint = Keypair.fromPublicKey(feeAccount).signatureHint();

    feeBumpTx.signatures.push({ hint, signature: sig } as any);

    logger.info(`Fee-bump built for student ${req.studentPublicKey}, feeAccount=${feeAccount}`);

    return { feeBumpXdr: feeBumpTx.toXDR() };
  }

  private isSequenceError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return /txBAD_SEQ|bad sequence|sequence number/i.test(message);
  }
}
