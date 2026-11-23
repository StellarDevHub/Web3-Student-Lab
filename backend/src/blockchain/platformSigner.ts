import logger from '../utils/logger.js';
import {
  KmsStellarSigner,
  type KmsSignableTransaction,
  type KmsSignerConfig,
} from './kmsSigner.js';

export type PlatformSigningPurpose = 'contract-admin' | 'faucet';

/**
 * Platform signing service (#1423 / BE-HARD-32).
 *
 * Centralises the two privileged signing flows that must never hold a raw
 * private key:
 *   • contract administration (pause/unpause, admin invocations)
 *   • faucet payouts on testnet
 *
 * Both delegate to a KMS-backed {@link KmsStellarSigner}, so signatures are
 * produced inside AWS KMS and only the detached signature is returned.
 */
export class PlatformSigningService {
  private readonly signer: KmsStellarSigner;

  constructor(config: KmsSignerConfig = {}, signer?: KmsStellarSigner) {
    this.signer = signer ?? new KmsStellarSigner(config);
  }

  public isKmsActive(): boolean {
    return this.signer.isKmsActive();
  }

  public getPublicKey(): string {
    return this.signer.getPublicKey();
  }

  /** Sign a contract-administration transaction. */
  public async signAdminTransaction<T extends KmsSignableTransaction>(transaction: T): Promise<T> {
    logger.info('PlatformSigningService: signing contract-administration transaction');
    return this.signer.signTransaction(transaction, 'contract-admin');
  }

  /** Sign a testnet faucet payout transaction. */
  public async signFaucetTransaction<T extends KmsSignableTransaction>(transaction: T): Promise<T> {
    logger.info('PlatformSigningService: signing faucet transaction');
    return this.signer.signTransaction(transaction, 'faucet');
  }
}

/**
 * Application-wide platform signer. Constructed lazily so importing modules do
 * not force KMS configuration at import time.
 */
let _instance: PlatformSigningService | null = null;

export function getPlatformSigningService(config?: KmsSignerConfig): PlatformSigningService {
  if (!_instance) {
    _instance = new PlatformSigningService(config);
  }
  return _instance;
}

export function resetPlatformSigningService(): void {
  _instance = null;
}
