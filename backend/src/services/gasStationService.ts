import {
  Address,
  BASE_FEE,
  FeeBumpTransaction,
  Horizon,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { KmsStellarSigner, type KmsSignableTransaction } from '../blockchain/kmsSigner.js';
import { HORIZON_URL } from '../config/rpcConfig.js';
import { refundGasQuota, reserveGasQuota } from '../middleware/gasQuotaMiddleware.js';
import logger from '../utils/logger.js';
import { getRedisClient } from '../utils/redis.js';
import { withLock } from '../utils/redlock.js';

/**
 * Gas station relayer (#1593 / BE-021).
 *
 * Accepts student-signed inner transactions, checks that every operation only
 * calls verified course contracts, wraps the transaction in a fee-bump
 * envelope paid by the relayer account and submits it to Horizon. Fees are
 * charged against the student's daily USD-denominated quota.
 */

// Verified course contracts. Fails closed: with no whitelist, nothing is sponsored.
const WHITELISTED_CONTRACTS = new Set(
  (process.env.GAS_STATION_WHITELISTED_CONTRACTS || process.env.RELAYER_WHITELISTED_CONTRACTS || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
);

// Hard per-transaction ceiling on what the relayer will pay (default 0.1 XLM).
const MAX_FEE_STROOPS = parseInt(process.env.GAS_STATION_MAX_FEE_STROOPS || '1000000', 10);
const MIN_BASE_FEE_STROOPS = parseInt(process.env.GAS_STATION_BASE_FEE_STROOPS || BASE_FEE, 10);
const SUBMIT_LOCK_TTL_MS = 30_000;
const REPLAY_TTL_SECONDS = 24 * 60 * 60;

export class GasStationError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);
    this.name = 'GasStationError';
  }
}

export interface SponsorRequest {
  studentId: string;
  studentPublicKey: string;
  innerTxXdr: string;
}

export interface SponsorResult {
  hash: string;
  ledger: number;
  feeChargedStroops: number;
  innerHash: string;
}

function networkPassphrase(): string {
  const net = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();
  return net === 'mainnet' || net === 'public' ? Networks.PUBLIC : Networks.TESTNET;
}

function contractOf(address: xdr.ScAddress): string {
  return Address.fromScAddress(address).toString();
}

/**
 * Serializes relayer submissions so concurrent sponsorships never race on the
 * relayer account. In-process requests queue on a promise chain per account;
 * a Redis lock extends the same guarantee across horizontally scaled pods.
 */
export class RelayerSubmissionQueue {
  private tails = new Map<string, Promise<unknown>>();
  private depth = new Map<string, number>();

  constructor(
    private lock: <T>(key: string, ttlMs: number, fn: () => Promise<T>) => Promise<T> = withLock
  ) {}

  pending(account: string): number {
    return this.depth.get(account) ?? 0;
  }

  enqueue<T>(account: string, job: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(account) ?? Promise.resolve();
    this.depth.set(account, this.pending(account) + 1);

    const run = previous
      .catch(() => undefined)
      .then(() => this.lock(`gas-station:submit:${account}`, SUBMIT_LOCK_TTL_MS, job));

    const tail = run.finally(() => {
      const remaining = this.pending(account) - 1;
      if (remaining <= 0) {
        this.depth.delete(account);
        // Drop the chain once idle so the map doesn't grow with history.
        if (this.tails.get(account) === tail) this.tails.delete(account);
      } else {
        this.depth.set(account, remaining);
      }
    });
    this.tails.set(account, tail.catch(() => undefined));
    return run;
  }
}

export class GasStationService {
  private signer?: KmsStellarSigner;
  private readonly passphrase = networkPassphrase();

  constructor(
    signer?: KmsStellarSigner,
    private queue = new RelayerSubmissionQueue(),
    private horizon = new Horizon.Server(HORIZON_URL, { allowHttp: HORIZON_URL.startsWith('http://') })
  ) {
    this.signer = signer;
  }

  private getSigner(): KmsStellarSigner {
    this.signer ??= new KmsStellarSigner();
    return this.signer;
  }

  getWhitelist(): string[] {
    return [...WHITELISTED_CONTRACTS];
  }

  getRelayerPublicKey(): string {
    return this.getSigner().getPublicKey();
  }

  parseInnerTransaction(innerTxXdr: string): Transaction {
    let parsed: Transaction | FeeBumpTransaction;
    try {
      parsed = TransactionBuilder.fromXDR(innerTxXdr, this.passphrase);
    } catch {
      throw new GasStationError('Invalid inner transaction XDR');
    }
    if (parsed instanceof FeeBumpTransaction) {
      throw new GasStationError('Cannot sponsor an existing fee-bump transaction');
    }
    return parsed;
  }

  /**
   * Policy checks that keep relayer funds from being spent on anything but
   * verified course contracts, submitted by the authenticated student.
   */
  validateInnerTransaction(tx: Transaction, studentPublicKey: string): void {
    if (WHITELISTED_CONTRACTS.size === 0) {
      throw new GasStationError('Gas sponsorship is disabled: no verified course contracts configured', 503);
    }
    if (!studentPublicKey) {
      throw new GasStationError('Link a Stellar wallet to your account before requesting sponsorship', 403);
    }
    if (tx.source !== studentPublicKey) {
      throw new GasStationError('Inner transaction source must be your linked wallet', 403);
    }
    if (tx.operations.length === 0) {
      throw new GasStationError('Inner transaction has no operations');
    }

    for (const op of tx.operations) {
      if (op.source && op.source !== studentPublicKey) {
        throw new GasStationError('Operations may not use a different source account', 403);
      }
      if (op.type !== 'invokeHostFunction') {
        throw new GasStationError(`Operation type ${op.type} is not eligible for sponsorship`, 403);
      }

      const func = (op as Operation.InvokeHostFunction).func;
      if (func.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
        throw new GasStationError('Only contract invocations can be sponsored', 403);
      }
      const contractId = contractOf(func.invokeContract().contractAddress());
      if (!WHITELISTED_CONTRACTS.has(contractId)) {
        throw new GasStationError(`Contract ${contractId} is not a verified course contract`, 403);
      }

      for (const entry of (op as Operation.InvokeHostFunction).auth ?? []) {
        const root = entry.rootInvocation().function();
        if (root.switch() === xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeContractFn()) {
          const authContract = contractOf(root.contractFn().contractAddress());
          if (!WHITELISTED_CONTRACTS.has(authContract)) {
            throw new GasStationError(`Authorization for contract ${authContract} is not sponsorable`, 403);
          }
        } else {
          throw new GasStationError('Contract deployment authorizations cannot be sponsored', 403);
        }
      }
    }

    const hash = tx.hash();
    const student = Keypair.fromPublicKey(studentPublicKey);
    const signed = tx.signatures.some((sig) => {
      try {
        return student.verify(hash, sig.signature());
      } catch {
        return false;
      }
    });
    if (!signed) {
      throw new GasStationError('Inner transaction is not signed by your wallet', 401);
    }
  }

  /**
   * Fee-bump fee for the inner transaction: the per-op inclusion bid (at least
   * the inner bid) times ops + 1, plus the Soroban resource fee.
   */
  computeFeeBump(tx: Transaction): { baseFee: number; totalFee: number } {
    const ops = tx.operations.length;
    const sorobanData = tx.toEnvelope().v1().tx().ext().value() as xdr.SorobanTransactionData | null;
    const resourceFee = sorobanData ? Number(sorobanData.resourceFee().toString()) : 0;
    const innerInclusionPerOp = Math.ceil((Number(tx.fee) - resourceFee) / ops);
    const baseFee = Math.max(MIN_BASE_FEE_STROOPS, innerInclusionPerOp);
    return { baseFee, totalFee: baseFee * (ops + 1) + resourceFee };
  }

  async sponsor(req: SponsorRequest): Promise<SponsorResult> {
    const inner = this.parseInnerTransaction(req.innerTxXdr);
    this.validateInnerTransaction(inner, req.studentPublicKey);

    const { baseFee, totalFee } = this.computeFeeBump(inner);
    if (totalFee > MAX_FEE_STROOPS) {
      throw new GasStationError(`Transaction fee ${totalFee} exceeds the sponsorship limit of ${MAX_FEE_STROOPS} stroops`);
    }

    const innerHash = inner.hash().toString('hex');
    const replayKey = `gas-station:inner:${innerHash}`;
    const redis = getRedisClient();
    if ((await redis.set(replayKey, req.studentId, 'EX', REPLAY_TTL_SECONDS, 'NX')) === null) {
      throw new GasStationError('This transaction has already been submitted for sponsorship', 409);
    }

    try {
      await reserveGasQuota(req.studentId, totalFee);
    } catch (err) {
      await redis.del(replayKey);
      throw new GasStationError((err as Error).message, 429);
    }

    const feeAccount = this.getRelayerPublicKey();
    try {
      const result = await this.queue.enqueue(feeAccount, async () => {
        const feeBump = TransactionBuilder.buildFeeBumpTransaction(
          feeAccount,
          String(baseFee),
          inner,
          this.passphrase
        );
        await this.getSigner().signTransaction(
          feeBump as unknown as KmsSignableTransaction,
          'gas-station-fee-bump'
        );
        return this.horizon.submitTransaction(feeBump);
      });

      logger.info(
        `Gas station sponsored ${innerHash} for student ${req.studentId}: hash=${result.hash}, fee=${totalFee}`
      );
      return { hash: result.hash, ledger: result.ledger, feeChargedStroops: totalFee, innerHash };
    } catch (err: any) {
      // Nothing landed on-chain, so give the quota and replay slot back.
      await refundGasQuota(req.studentId, totalFee);
      await redis.del(replayKey);
      const code = err?.response?.data?.extras?.result_codes?.transaction || err?.message || 'unknown';
      logger.error(`Gas station submission failed for ${innerHash}: ${code}`);
      throw new GasStationError(`Transaction submission failed: ${code}`, 502);
    }
  }
}

export const gasStationService = new GasStationService();
