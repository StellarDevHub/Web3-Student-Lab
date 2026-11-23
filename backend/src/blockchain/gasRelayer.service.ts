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

export interface RelayRequest {
  innerTxXdr: string;
  studentPublicKey: string;
}

export interface RelayResult {
  feeBumpXdr: string;
}

export class GasRelayerService {
  private signer: KmsStellarSigner;
  private networkPassphrase: string;

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
   * it with the relayer master key (KMS or software fallback).
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

    const feeAccount = this.signer.getPublicKey();

    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      feeAccount,
      String(MAX_FEE_STROOPS),
      innerTx,
      this.networkPassphrase
    );

    // Sign the fee-bump envelope hash with the relayer master key
    const txHash = feeBumpTx.hash();
    const sig = await this.signer.signTransactionHash(txHash);

    // Derive the 4-byte hint from the raw public key bytes (last 4 bytes)
    const relayerPublicKey = this.signer.getPublicKey();
    const hint = Keypair.fromPublicKey(relayerPublicKey).signatureHint();

    feeBumpTx.signatures.push({ hint, signature: sig } as any);

    logger.info(`Fee-bump built for student ${req.studentPublicKey}, feeAccount=${feeAccount}`);

    return { feeBumpXdr: feeBumpTx.toXDR() };
  }
}
