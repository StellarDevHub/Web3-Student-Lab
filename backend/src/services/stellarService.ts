import {
  FeeBumpTransaction,
  Horizon,
  Networks,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';
import {
  getKmsSignerService,
  type HsmProviderName,
  type KmsSignerService,
} from './kmsSignerService.js';

/**
 * Custodial relayer Stellar service (BE-002 / #1574).
 *
 * Parses, fee-bumps, signs and submits Stellar transaction envelopes on behalf
 * of the platform relayer. It never holds a secret key: every signature is
 * delegated to {@link KmsSignerService}, which signs inside AWS KMS or
 * HashiCorp Vault and writes an audit record per operation.
 */

export interface SignedEnvelope {
  /** Base64 XDR of the signed envelope. */
  xdr: string;
  /** Hex transaction hash that was signed. */
  hash: string;
  signerPublicKey: string;
  provider: HsmProviderName;
  /** Provider request id recorded in the signature audit log. */
  requestId: string;
}

export interface RelayerStellarServiceOptions {
  signer?: KmsSignerService;
  horizonUrl?: string;
  networkPassphrase?: string;
  /** Upper bound on the fee-bump base fee, in stroops. */
  maxFeeStroops?: number;
}

export function resolveNetworkPassphrase(network = process.env.STELLAR_NETWORK || 'testnet'): string {
  switch (network.toLowerCase()) {
    case 'mainnet':
    case 'public':
      return Networks.PUBLIC;
    case 'futurenet':
      return Networks.FUTURENET;
    default:
      return Networks.TESTNET;
  }
}

export class RelayerStellarService {
  private readonly signer: KmsSignerService;
  private readonly networkPassphrase: string;
  private readonly horizonUrl: string;
  private readonly maxFeeStroops: number;
  private server: Horizon.Server | null = null;

  constructor(options: RelayerStellarServiceOptions = {}) {
    this.signer = options.signer ?? getKmsSignerService();
    this.networkPassphrase = options.networkPassphrase ?? resolveNetworkPassphrase();
    this.horizonUrl =
      options.horizonUrl ?? process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
    this.maxFeeStroops =
      options.maxFeeStroops ?? Number.parseInt(process.env.RELAYER_MAX_FEE_STROOPS || '10000000', 10);
  }

  public getRelayerPublicKey(): Promise<string> {
    return this.signer.getPublicKey();
  }

  public getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }

  /** Decode an envelope, refusing anything bound to a different network. */
  public parseEnvelope(envelopeXdr: string): Transaction | FeeBumpTransaction {
    try {
      return TransactionBuilder.fromXDR(envelopeXdr, this.networkPassphrase);
    } catch {
      throw new Error('Invalid Stellar transaction envelope XDR');
    }
  }

  /** Sign an envelope with the custodial relayer key inside the HSM boundary. */
  public async signEnvelope(envelopeXdr: string, purpose = 'relayer-envelope'): Promise<SignedEnvelope> {
    return this.sign(this.parseEnvelope(envelopeXdr), purpose);
  }

  /**
   * Wrap a user-signed inner transaction in a fee-bump paid by the relayer
   * account and sign the outer envelope via the HSM.
   */
  public async sponsorWithFeeBump(
    innerEnvelopeXdr: string,
    baseFeeStroops = this.maxFeeStroops,
  ): Promise<SignedEnvelope> {
    const inner = this.parseEnvelope(innerEnvelopeXdr);
    if (inner instanceof FeeBumpTransaction) {
      throw new Error('Cannot wrap an existing fee-bump transaction');
    }
    if (inner.signatures.length === 0) {
      throw new Error('Inner transaction must be signed by its source before sponsorship');
    }
    if (!Number.isFinite(baseFeeStroops) || baseFeeStroops <= 0 || baseFeeStroops > this.maxFeeStroops) {
      throw new Error(`Fee-bump base fee must be between 1 and ${this.maxFeeStroops} stroops`);
    }

    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      await this.signer.getPublicKey(),
      String(baseFeeStroops),
      inner,
      this.networkPassphrase,
    );

    return this.sign(feeBump, 'relayer-fee-bump');
  }

  /** Submit a signed envelope to Horizon. */
  public async submit(signedEnvelopeXdr: string): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    const transaction = this.parseEnvelope(signedEnvelopeXdr);
    if (transaction.signatures.length === 0) {
      throw new Error('Refusing to submit an unsigned envelope');
    }
    return this.getServer().submitTransaction(transaction);
  }

  private async sign(transaction: Transaction | FeeBumpTransaction, purpose: string): Promise<SignedEnvelope> {
    const hash = transaction.hash();
    const result = await this.signer.signHash(hash, { purpose });
    transaction.addSignature(result.publicKey, result.signature.toString('base64'));

    logger.info(
      `Relayer envelope signed via ${result.provider} (purpose=${purpose}, requestId=${result.requestId})`,
    );

    return {
      xdr: transaction.toXDR(),
      hash: hash.toString('hex'),
      signerPublicKey: result.publicKey,
      provider: result.provider,
      requestId: result.requestId,
    };
  }

  private getServer(): Horizon.Server {
    if (!this.server) this.server = new Horizon.Server(this.horizonUrl);
    return this.server;
  }
}

let instance: RelayerStellarService | null = null;

export function getRelayerStellarService(options?: RelayerStellarServiceOptions): RelayerStellarService {
  if (!instance) instance = new RelayerStellarService(options);
  return instance;
}

export function resetRelayerStellarService(): void {
  instance = null;
}
