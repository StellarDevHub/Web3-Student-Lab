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
 * Gas station relayer (#1593 / BE-021, hardened in BE-091).
 *
 * Accepts student-signed inner transactions, enforces geofencing, Redis 24h
 * abuse blacklisting, Turnstile CAPTCHA for unlinked wallets, strict verified
 * course contract whitelisting (rejecting arbitrary fund transfers), a daily
 * cap of 50 sponsored transactions per student, and a daily USD-denominated
 * spending cap before wrapping in a fee-bump envelope and submitting to Horizon.
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Functions that perform arbitrary token/fund transfers and must not be sponsored.
const BLOCKED_FUND_TRANSFER_FUNCTIONS = new Set([
  'transfer',
  'transfer_from',
  'transfer_muxed',
  'clawback',
  'burn',
  'burn_from',
]);

// Hard per-transaction ceiling on what the relayer will pay (default 0.1 XLM).
const MAX_FEE_STROOPS = parseInt(process.env.GAS_STATION_MAX_FEE_STROOPS || '1000000', 10);
const MIN_BASE_FEE_STROOPS = parseInt(process.env.GAS_STATION_BASE_FEE_STROOPS || BASE_FEE, 10);
const SUBMIT_LOCK_TTL_MS = 30_000;
const REPLAY_TTL_SECONDS = 24 * 60 * 60;

// Anti-drain & budget cap defaults
export const DEFAULT_DAILY_TX_CAP = 50;
export const BLACKLIST_TTL_SECONDS = 24 * 60 * 60; // 24 hours
export const DEFAULT_ABUSE_THRESHOLD = 5;
export const DEFAULT_ABUSE_WINDOW_SECONDS = 10 * 60; // 10 minutes

const RESERVE_TX_CAP_SCRIPT = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
if count + 1 > limit then
  return -1
end
local total = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
return total
`;

const RECORD_ABUSE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return count
`;

function parseCsvSet(value?: string): Set<string> {
  return new Set(
    (value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
}

function dailyTxCountKey(studentId: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `gas-station:tx-count:${studentId}:${today}`;
}

function blacklistKey(address: string): string {
  return `gas-station:blacklist:${address}`;
}

function abuseKey(address: string): string {
  return `gas-station:abuse:${address}`;
}

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
  turnstileToken?: string;
  clientIp?: string;
  countryCode?: string;
}

export interface SponsorResult {
  hash: string;
  ledger: number;
  feeChargedStroops: number;
  innerHash: string;
}

export interface DailyTxCapUsage {
  used: number;
  limit: number;
  remaining: number;
}

export interface GasStationOptions {
  whitelistedContracts?: string[];
  dailyTxCap?: number;
  abuseThreshold?: number;
  abuseWindowSeconds?: number;
  blacklistTtlSeconds?: number;
  blockedCountries?: string[];
  allowedCountries?: string[];
  turnstileSecretKey?: string;
  fetchFn?: typeof fetch;
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
  private readonly options: GasStationOptions;

  constructor(
    signer?: KmsStellarSigner,
    private queue = new RelayerSubmissionQueue(),
    private horizon = new Horizon.Server(HORIZON_URL, { allowHttp: HORIZON_URL.startsWith('http://') }),
    options: GasStationOptions = {}
  ) {
    this.signer = signer;
    this.options = options;
  }

  private getSigner(): KmsStellarSigner {
    this.signer ??= new KmsStellarSigner();
    return this.signer;
  }

  private getWhitelistedContractSet(): Set<string> {
    if (this.options.whitelistedContracts) {
      return new Set(this.options.whitelistedContracts.map((c) => c.trim()).filter(Boolean));
    }
    return parseCsvSet(
      process.env.GAS_STATION_WHITELISTED_CONTRACTS || process.env.RELAYER_WHITELISTED_CONTRACTS
    );
  }

  private getDailyTxCap(): number {
    return (
      this.options.dailyTxCap ??
      parseInt(process.env.GAS_STATION_DAILY_TX_CAP || String(DEFAULT_DAILY_TX_CAP), 10)
    );
  }

  private getAbuseThreshold(): number {
    return (
      this.options.abuseThreshold ??
      parseInt(process.env.GAS_STATION_ABUSE_THRESHOLD || String(DEFAULT_ABUSE_THRESHOLD), 10)
    );
  }

  private getAbuseWindowSeconds(): number {
    return (
      this.options.abuseWindowSeconds ??
      parseInt(
        process.env.GAS_STATION_ABUSE_WINDOW_SECONDS || String(DEFAULT_ABUSE_WINDOW_SECONDS),
        10
      )
    );
  }

  private getBlacklistTtlSeconds(): number {
    return (
      this.options.blacklistTtlSeconds ??
      parseInt(process.env.GAS_STATION_BLACKLIST_TTL_SECONDS || String(BLACKLIST_TTL_SECONDS), 10)
    );
  }

  private getBlockedCountries(): Set<string> {
    const list = this.options.blockedCountries
      ? new Set(this.options.blockedCountries.map((c) => c.trim().toUpperCase()).filter(Boolean))
      : new Set(
          [...parseCsvSet(process.env.GAS_STATION_BLOCKED_COUNTRIES)].map((c) => c.toUpperCase())
        );
    return list;
  }

  private getAllowedCountries(): Set<string> {
    const list = this.options.allowedCountries
      ? new Set(this.options.allowedCountries.map((c) => c.trim().toUpperCase()).filter(Boolean))
      : new Set(
          [...parseCsvSet(process.env.GAS_STATION_ALLOWED_COUNTRIES)].map((c) => c.toUpperCase())
        );
    return list;
  }

  getWhitelist(): string[] {
    return [...this.getWhitelistedContractSet()];
  }

  getRelayerPublicKey(): string {
    return this.getSigner().getPublicKey();
  }

  /**
   * Enforce geofencing rules based on country code headers (e.g. CF-IPCountry).
   */
  validateGeofence(countryCode?: string): void {
    const normalized = countryCode?.trim().toUpperCase();
    const blocked = this.getBlockedCountries();
    if (normalized && blocked.has(normalized)) {
      throw new GasStationError('Gas sponsorship is not available in your region', 403);
    }
    const allowed = this.getAllowedCountries();
    if (allowed.size > 0 && (!normalized || !allowed.has(normalized))) {
      throw new GasStationError('Gas sponsorship is not available in your region', 403);
    }
  }

  /**
   * Check whether a wallet address is currently blacklisted in Redis.
   */
  async isAddressBlacklisted(address: string): Promise<boolean> {
    if (!address) return false;
    const redis = getRedisClient();
    const entry = await redis.get(blacklistKey(address));
    return entry !== null;
  }

  /**
   * Blacklist an abusive address in Redis for 24 hours (default).
   */
  async blacklistAddress(
    address: string,
    reason: string,
    ttlSeconds = this.getBlacklistTtlSeconds()
  ): Promise<void> {
    if (!address) return;
    const redis = getRedisClient();
    await redis.set(blacklistKey(address), reason, 'EX', ttlSeconds);
    logger.warn(
      `Gas station blacklisted address ${address} for ${ttlSeconds}s: ${reason}`
    );
  }

  /**
   * Track abusive or policy-violating attempts for an address. Once the
   * threshold is reached within the rolling window, automatically blacklist
   * the address in Redis for 24 hours.
   */
  async recordAbuseAttempt(
    address: string,
    reason: string
  ): Promise<{ count: number; blacklisted: boolean }> {
    if (!address) return { count: 0, blacklisted: false };
    try {
      const redis = getRedisClient();
      const count = Number(
        await redis.eval(RECORD_ABUSE_SCRIPT, 1, abuseKey(address), this.getAbuseWindowSeconds())
      );
      if (count >= this.getAbuseThreshold()) {
        await this.blacklistAddress(address, reason);
        return { count, blacklisted: true };
      }
      return { count, blacklisted: false };
    } catch (err) {
      logger.warn(`Failed to record gas station abuse attempt for ${address}:`, err);
      return { count: 0, blacklisted: false };
    }
  }

  /**
   * Verify a Cloudflare Turnstile CAPTCHA token for unlinked wallets.
   */
  async verifyTurnstileToken(token: string, clientIp?: string): Promise<boolean> {
    const secret = this.options.turnstileSecretKey ?? process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      throw new GasStationError(
        'Turnstile CAPTCHA verification is not configured on the server',
        503
      );
    }

    const body = new URLSearchParams({ secret, response: token });
    if (clientIp) {
      body.set('remoteip', clientIp);
    }

    const fetchImpl = this.options.fetchFn ?? fetch;
    try {
      const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!response.ok) {
        return false;
      }
      const data = (await response.json()) as { success?: boolean };
      return data.success === true;
    } catch (err) {
      logger.error('Turnstile CAPTCHA verification request failed:', err);
      return false;
    }
  }

  /**
   * Return the student's daily sponsored transaction count usage (cap: 50/day).
   */
  async getDailyTxCount(studentId: string): Promise<DailyTxCapUsage> {
    const limit = this.getDailyTxCap();
    const raw = await getRedisClient().get(dailyTxCountKey(studentId));
    const used = raw ? parseInt(raw, 10) : 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  }

  /**
   * Atomically reserve 1 slot from the student's daily sponsored transaction cap.
   */
  async reserveDailyTxSlot(studentId: string): Promise<number> {
    const limit = this.getDailyTxCap();
    const result = Number(
      await getRedisClient().eval(
        RESERVE_TX_CAP_SCRIPT,
        1,
        dailyTxCountKey(studentId),
        limit,
        secondsUntilMidnightUTC()
      )
    );
    if (result < 0) {
      throw new GasStationError(
        `Daily limit of ${limit} sponsored transactions reached`,
        429
      );
    }
    return result;
  }

  /**
   * Return a reserved daily transaction slot if submission fails.
   */
  async refundDailyTxSlot(studentId: string): Promise<void> {
    try {
      await getRedisClient().decr(dailyTxCountKey(studentId));
    } catch (err) {
      logger.warn(`Gas station daily tx cap refund failed for ${studentId}:`, err);
    }
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

  private validateAuthorizedInvocation(
    invocation: xdr.SorobanAuthorizedInvocation,
    whitelist: Set<string>
  ): void {
    const fn = invocation.function();
    if (fn.switch() === xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeContractFn()) {
      const contractFn = fn.contractFn();
      const authContract = contractOf(contractFn.contractAddress());
      if (!whitelist.has(authContract)) {
        throw new GasStationError(
          `Authorization for contract ${authContract} is not sponsorable`,
          403
        );
      }
      const fnName = contractFn.functionName().toString().trim().toLowerCase();
      if (BLOCKED_FUND_TRANSFER_FUNCTIONS.has(fnName)) {
        throw new GasStationError(
          `Authorized function ${fnName} is not eligible for gas sponsorship`,
          403
        );
      }
    } else {
      throw new GasStationError('Contract deployment authorizations cannot be sponsored', 403);
    }

    for (const sub of invocation.subInvocations() ?? []) {
      this.validateAuthorizedInvocation(sub, whitelist);
    }
  }

  /**
   * Policy checks that keep relayer funds from being spent on anything but
   * verified course contracts, submitted by the authenticated student.
   */
  validateInnerTransaction(tx: Transaction, studentPublicKey: string): void {
    const whitelist = this.getWhitelistedContractSet();
    if (whitelist.size === 0) {
      throw new GasStationError(
        'Gas sponsorship is disabled: no verified course contracts configured',
        503
      );
    }
    if (!studentPublicKey) {
      throw new GasStationError(
        'Link a Stellar wallet to your account before requesting sponsorship',
        403
      );
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
      const invokeArgs = func.invokeContract();
      const contractId = contractOf(invokeArgs.contractAddress());
      if (!whitelist.has(contractId)) {
        throw new GasStationError(`Contract ${contractId} is not a verified course contract`, 403);
      }

      const fnName = invokeArgs.functionName().toString().trim().toLowerCase();
      if (!fnName) {
        throw new GasStationError('Contract function name cannot be empty', 400);
      }
      if (BLOCKED_FUND_TRANSFER_FUNCTIONS.has(fnName)) {
        throw new GasStationError(
          `Function ${fnName} is not eligible for gas sponsorship (arbitrary fund transfers are prohibited)`,
          403
        );
      }

      for (const entry of (op as Operation.InvokeHostFunction).auth ?? []) {
        this.validateAuthorizedInvocation(entry.rootInvocation(), whitelist);
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
    // 1. Geofencing check
    this.validateGeofence(req.countryCode);

    // 2. Parse inner transaction so we know the source address
    const inner = this.parseInnerTransaction(req.innerTxXdr);
    const sourceAddress = inner.source;

    // 3. Check 24h Redis blacklist for both linked wallet (if any) and tx source
    if (
      (req.studentPublicKey && (await this.isAddressBlacklisted(req.studentPublicKey))) ||
      (await this.isAddressBlacklisted(sourceAddress))
    ) {
      throw new GasStationError(
        'Address is temporarily blacklisted for 24 hours due to abusive activity',
        403
      );
    }

    // 4. Mandate Turnstile CAPTCHA verification for unlinked wallets
    let effectivePublicKey = req.studentPublicKey;
    if (!effectivePublicKey) {
      if (!req.turnstileToken) {
        await this.recordAbuseAttempt(sourceAddress, 'Missing Turnstile CAPTCHA for unlinked wallet');
        throw new GasStationError(
          'Turnstile CAPTCHA verification is required for unlinked wallets',
          403
        );
      }
      const verified = await this.verifyTurnstileToken(req.turnstileToken, req.clientIp);
      if (!verified) {
        await this.recordAbuseAttempt(sourceAddress, 'Failed Turnstile CAPTCHA verification');
        throw new GasStationError('Turnstile CAPTCHA verification failed', 403);
      }
      effectivePublicKey = sourceAddress;
    }

    // 5. Strict contract whitelist, anti-fund-transfer & signature validation
    try {
      this.validateInnerTransaction(inner, effectivePublicKey);
    } catch (err) {
      if (err instanceof GasStationError && err.statusCode !== 503) {
        await this.recordAbuseAttempt(sourceAddress, err.message);
      }
      throw err;
    }

    const { baseFee, totalFee } = this.computeFeeBump(inner);
    if (totalFee > MAX_FEE_STROOPS) {
      await this.recordAbuseAttempt(sourceAddress, `Excessive fee requested: ${totalFee}`);
      throw new GasStationError(
        `Transaction fee ${totalFee} exceeds the sponsorship limit of ${MAX_FEE_STROOPS} stroops`
      );
    }

    const innerHash = inner.hash().toString('hex');
    const replayKey = `gas-station:inner:${innerHash}`;
    const redis = getRedisClient();
    if ((await redis.set(replayKey, req.studentId, 'EX', REPLAY_TTL_SECONDS, 'NX')) === null) {
      await this.recordAbuseAttempt(sourceAddress, 'Duplicate transaction replay attempt');
      throw new GasStationError('This transaction has already been submitted for sponsorship', 409);
    }

    // 6. Enforce daily per-student transaction count cap (max 50/day)
    try {
      await this.reserveDailyTxSlot(req.studentId);
    } catch (err) {
      await redis.del(replayKey);
      await this.recordAbuseAttempt(sourceAddress, 'Daily sponsored transaction cap exceeded');
      throw err;
    }

    // 7. Enforce daily per-student USD/stroops spending cap
    try {
      await reserveGasQuota(req.studentId, totalFee);
    } catch (err) {
      await this.refundDailyTxSlot(req.studentId);
      await redis.del(replayKey);
      await this.recordAbuseAttempt(sourceAddress, 'Daily gas spending quota exceeded');
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
      // Nothing landed on-chain, so give the quota, daily tx slot, and replay slot back.
      await refundGasQuota(req.studentId, totalFee);
      await this.refundDailyTxSlot(req.studentId);
      await redis.del(replayKey);
      const code = err?.response?.data?.extras?.result_codes?.transaction || err?.message || 'unknown';
      logger.error(`Gas station submission failed for ${innerHash}: ${code}`);
      throw new GasStationError(`Transaction submission failed: ${code}`, 502);
    }
  }
}

export const gasStationService = new GasStationService();
