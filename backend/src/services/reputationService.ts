/**
 * Reputation Service — BE-067
 *
 * Scores every caller (anonymous IP or authenticated student / DID) and maps
 * the score to a rate-limit tier.  BE-067 adds three new adaptive signals to
 * the original BE-012 baseline:
 *
 *   NEW  wallet tenure      – months since first on-chain activity (+30 max)
 *   NEW  certificate count  – active/minted certs held by the student (+20 max)
 *   NEW  CAPTCHA verified   – at least one recent verified CAPTCHA session (+20)
 *
 * Full signal table:
 *
 *   signal                                   points
 *   ───────────────────────────────────────  ──────
 *   authenticated session                     +40
 *   linked decentralised identifier (DID)     +20
 *   verified student (≥1 active certificate)  +20
 *   active on-chain stake (Stellar asset)     +40
 *   wallet tenure bonus (up to 30 months)     +30 max (1 pt / month, capped)
 *   certificate count bonus (up to 10 certs)  +20 max (2 pts / cert, capped)
 *   CAPTCHA verification (recent session)     +20
 *   each recent rate-limit violation          -10
 *
 * Tier mapping:
 *   score <   0  → restricted   (hammering bots, persistent violators)
 *   score <  40  → anonymous    (unverified IPs, unrecognised scrapers)
 *   score <  60  → captcha      (IP-only callers who passed a CAPTCHA)
 *   score <  80  → authenticated(logged-in students without certificates)
 *   score < 120  → verified     (enrolled students with active certs)
 *   score ≥ 120  → staker       (authenticated DID + active stake)
 *
 * Rate ceilings (sustained 60 s window) per tier:
 *   restricted    →    5 req/min
 *   anonymous     →   10 req/min   (scraper floor, BE-067 requirement)
 *   captcha       →   30 req/min
 *   authenticated →  120 req/min
 *   verified      →  300 req/min   (enrolled student, BE-067 requirement)
 *   staker        →  600 req/min
 *
 * Profiles are cached for `REPUTATION_CACHE_TTL_MS` (default 60 s) and
 * invalidated immediately on a violation record, so a caller that escalates
 * their privilege (earns a cert, passes a CAPTCHA) is re-scored within one
 * cache TTL.
 */

import type { Request } from 'express';
import { Horizon } from '@stellar/stellar-sdk';
import { getStudentById } from '../auth/auth.service.js';
import { verifyAccessToken } from '../auth/token.service.js';
import type { User } from '../auth/types.js';
import prisma from '../db/index.js';
import type { WindowRule } from '../utils/slidingWindow.js';
import logger from '../utils/logger.js';
import { redisConnection } from '../utils/redis.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * BE-067: `captcha` tier sits between anonymous and authenticated to give
 * human-verified IPs a meaningful step-up without requiring a full login.
 */
export type ReputationTier =
  | 'restricted'
  | 'anonymous'
  | 'captcha'
  | 'authenticated'
  | 'verified'
  | 'staker';

export interface CallerIdentity {
  /** Stable rate-limit key: `did:…`, `user:…` or `ip:…`. */
  key: string;
  kind: 'did' | 'user' | 'ip';
  userId?: string;
  did?: string | null;
  walletAddress?: string | null;
  ip: string;
}

export interface ReputationProfile {
  identity: CallerIdentity;
  score: number;
  tier: ReputationTier;
  signals: {
    authenticated: boolean;
    hasDid: boolean;
    verifiedStudent: boolean;
    activeStake: boolean;
    /** BE-067: months since wallet first activity (0 when no wallet). */
    walletTenureMonths: number;
    /** BE-067: number of active/minted certificates held. */
    certificateCount: number;
    /** BE-067: true when the IP/user has a recent verified CAPTCHA session. */
    captchaVerified: boolean;
    recentViolations: number;
  };
  computedAt: number;
}

// ─── Tier limits (sliding-window rules) ──────────────────────────────────────

/**
 * Each tier has a 1-second burst window and a 60-second sustained window.
 * BE-067 requirement: unverified IPs must be capped at 10 req/min; enrolled
 * students must be allowed up to 300 req/min without false positives.
 */
export const TIER_LIMITS: Record<ReputationTier, WindowRule[]> = {
  restricted: [
    { name: 'burst',     limit: 2,   windowMs: 1_000  },
    { name: 'sustained', limit: 5,   windowMs: 60_000 },
  ],
  anonymous: [
    { name: 'burst',     limit: 3,   windowMs: 1_000  },
    { name: 'sustained', limit: 10,  windowMs: 60_000 },
  ],
  captcha: [
    { name: 'burst',     limit: 5,   windowMs: 1_000  },
    { name: 'sustained', limit: 30,  windowMs: 60_000 },
  ],
  authenticated: [
    { name: 'burst',     limit: 15,  windowMs: 1_000  },
    { name: 'sustained', limit: 120, windowMs: 60_000 },
  ],
  verified: [
    { name: 'burst',     limit: 30,  windowMs: 1_000  },
    { name: 'sustained', limit: 300, windowMs: 60_000 },
  ],
  staker: [
    { name: 'burst',     limit: 60,  windowMs: 1_000  },
    { name: 'sustained', limit: 600, windowMs: 60_000 },
  ],
};

// ─── Score weights ────────────────────────────────────────────────────────────

export const SCORE_WEIGHTS = {
  authenticated:    40,
  did:              20,
  verifiedStudent:  20,
  activeStake:      40,
  /** BE-067: 1 point per month of wallet tenure, capped at 30. */
  walletTenurePerMonth: 1,
  walletTenureMax:  30,
  /** BE-067: 2 points per active certificate, capped at 10 certs (20 pts). */
  certPerCert:       2,
  certMax:          20,
  /** BE-067: flat bonus for a recent verified CAPTCHA session. */
  captchaVerified:  20,
  violation:        -10,
} as const;

// ─── Internal constants ───────────────────────────────────────────────────────

const VIOLATION_TTL_SECONDS    = 3_600;
const MAX_COUNTED_VIOLATIONS   = 10;
/** BE-067: a CAPTCHA verification is "recent" for this many seconds (1 hour). */
const CAPTCHA_TTL_SECONDS      = 3_600;
/** BE-067: certificate cap for the bonus calculation. */
const CERT_BONUS_CAP           = 10;
/** BE-067: wallet-tenure cap in months. */
const TENURE_MONTHS_CAP        = 30;

// ─── Tier mapping ─────────────────────────────────────────────────────────────

export function tierForScore(score: number): ReputationTier {
  if (score <   0) return 'restricted';
  if (score <  40) return 'anonymous';
  if (score <  60) return 'captcha';
  if (score <  80) return 'authenticated';
  if (score < 120) return 'verified';
  return 'staker';
}

// ─── Staking provider ─────────────────────────────────────────────────────────

export interface StakingProvider {
  hasActiveStake(walletAddress: string): Promise<boolean>;
}

export class HorizonStakingProvider implements StakingProvider {
  private readonly server: Horizon.Server;
  private readonly assetCode    = process.env.STAKING_ASSET_CODE   || '';
  private readonly assetIssuer  = process.env.STAKING_ASSET_ISSUER || '';
  private readonly minBalance   = Number(process.env.STAKING_MIN_BALANCE || '1');

  constructor(horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org') {
    this.server = new Horizon.Server(horizonUrl);
  }

  async hasActiveStake(walletAddress: string): Promise<boolean> {
    if (!this.assetCode || !this.assetIssuer) return false;
    try {
      const account = await this.server.loadAccount(walletAddress);
      return account.balances.some(
        (balance) =>
          'asset_code'   in balance &&
          'asset_issuer' in balance &&
          balance.asset_code   === this.assetCode &&
          balance.asset_issuer === this.assetIssuer &&
          Number(balance.balance) >= this.minBalance,
      );
    } catch (error) {
      logger.debug('[BE-067] Staking lookup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// ─── BE-067: Wallet tenure provider ──────────────────────────────────────────

/**
 * Returns the number of months since the wallet's first recorded on-chain
 * activity.  Implementations can use Horizon ledger data, an internal DB
 * record, or any other data source.
 */
export interface WalletTenureProvider {
  getTenureMonths(walletAddress: string): Promise<number>;
}

/**
 * Default implementation: looks up the wallet's `createdAt` field in the
 * local `WalletProfile` table (or falls back to 0 when not found so a missing
 * record never inflates the score).
 */
export class DatabaseWalletTenureProvider implements WalletTenureProvider {
  async getTenureMonths(walletAddress: string): Promise<number> {
    try {
      const profile = await prisma.walletProfile.findUnique({
        where: { address: walletAddress },
        select: { createdAt: true },
      });
      if (!profile) return 0;
      const ageMs = Date.now() - new Date(profile.createdAt).getTime();
      return Math.floor(ageMs / (1000 * 60 * 60 * 24 * 30));
    } catch (error) {
      logger.debug('[BE-067] Wallet tenure lookup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}

// ─── BE-067: CAPTCHA verification store ──────────────────────────────────────

/**
 * Stores and retrieves verified CAPTCHA sessions keyed by IP address or user
 * ID.  A verification is considered "recent" while its TTL has not expired.
 */
export interface CaptchaVerificationStore {
  /** Record a successful CAPTCHA verification for the given key. */
  record(key: string): Promise<void>;
  /** Returns true when a recent verification exists for the key. */
  isVerified(key: string): Promise<boolean>;
}

export class RedisCaptchaVerificationStore implements CaptchaVerificationStore {
  private readonly memory = new Map<string, number>();

  private redisKey(key: string): string {
    return `rep:captcha:${key}`;
  }

  async record(key: string): Promise<void> {
    try {
      await redisConnection.set(this.redisKey(key), '1', 'EX', CAPTCHA_TTL_SECONDS);
    } catch {
      // Fallback: in-process TTL map so a Redis outage does not break CAPTCHA flow.
      this.memory.set(key, Date.now() + CAPTCHA_TTL_SECONDS * 1000);
    }
  }

  async isVerified(key: string): Promise<boolean> {
    try {
      const val = await redisConnection.get(this.redisKey(key));
      return val === '1';
    } catch {
      const expiresAt = this.memory.get(key) ?? 0;
      return Date.now() < expiresAt;
    }
  }
}

// ─── Violation store ──────────────────────────────────────────────────────────

export interface ViolationStore {
  increment(identityKey: string): Promise<number>;
  count(identityKey: string): Promise<number>;
}

class RedisViolationStore implements ViolationStore {
  private readonly memory = new Map<string, { count: number; expiresAt: number }>();

  private key(identityKey: string): string {
    return `rep:violations:${identityKey}`;
  }

  async increment(identityKey: string): Promise<number> {
    try {
      const count = Number(await redisConnection.incr(this.key(identityKey)));
      if (count === 1) await redisConnection.expire(this.key(identityKey), VIOLATION_TTL_SECONDS);
      return count;
    } catch {
      const now = Date.now();
      const entry = this.memory.get(identityKey);
      const count = entry && entry.expiresAt > now ? entry.count + 1 : 1;
      this.memory.set(identityKey, {
        count,
        expiresAt:
          entry && entry.expiresAt > now
            ? entry.expiresAt
            : now + VIOLATION_TTL_SECONDS * 1000,
      });
      return count;
    }
  }

  async count(identityKey: string): Promise<number> {
    try {
      return Number((await redisConnection.get(this.key(identityKey))) ?? 0);
    } catch {
      const entry = this.memory.get(identityKey);
      return entry && entry.expiresAt > Date.now() ? entry.count : 0;
    }
  }
}

// ─── Service options & defaults ───────────────────────────────────────────────

export interface ReputationServiceOptions {
  stakingProvider?:    StakingProvider;
  walletTenure?:       WalletTenureProvider;
  captchaStore?:       CaptchaVerificationStore;
  violationStore?:     ViolationStore;
  /** Returns true when the student has at least one active certificate. */
  isVerifiedStudent?:  (userId: string) => Promise<boolean>;
  /** Returns the total number of active/minted certificates for a student. */
  certificateCount?:   (userId: string) => Promise<number>;
  cacheTtlMs?:         number;
  maxCacheEntries?:    number;
}

// ─── Database helpers ─────────────────────────────────────────────────────────

async function hasActiveCertificate(userId: string): Promise<boolean> {
  try {
    const count = await prisma.certificate.count({
      where: { studentId: userId, status: { in: ['ACTIVE', 'MINTED'] } },
    });
    return count > 0;
  } catch {
    return false;
  }
}

async function countActiveCertificates(userId: string): Promise<number> {
  try {
    return await prisma.certificate.count({
      where: { studentId: userId, status: { in: ['ACTIVE', 'MINTED'] } },
    });
  } catch {
    return 0;
  }
}

// ─── ReputationService ────────────────────────────────────────────────────────

export class ReputationService {
  private readonly stakingProvider:   StakingProvider;
  private readonly walletTenure:      WalletTenureProvider;
  private readonly captchaStore:      CaptchaVerificationStore;
  private readonly violations:        ViolationStore;
  private readonly isVerifiedStudent: (userId: string) => Promise<boolean>;
  private readonly certificateCount:  (userId: string) => Promise<number>;
  private readonly cacheTtlMs:        number;
  private readonly maxCacheEntries:   number;
  private readonly cache  = new Map<string, ReputationProfile>();
  private readonly users  = new Map<string, { user: User | null; at: number }>();

  constructor(options: ReputationServiceOptions = {}) {
    this.stakingProvider   = options.stakingProvider  ?? new HorizonStakingProvider();
    this.walletTenure      = options.walletTenure     ?? new DatabaseWalletTenureProvider();
    this.captchaStore      = options.captchaStore     ?? new RedisCaptchaVerificationStore();
    this.violations        = options.violationStore   ?? new RedisViolationStore();
    this.isVerifiedStudent = options.isVerifiedStudent ?? hasActiveCertificate;
    this.certificateCount  = options.certificateCount  ?? countActiveCertificates;
    this.cacheTtlMs        = options.cacheTtlMs ?? Number(process.env.REPUTATION_CACHE_TTL_MS || '60000');
    this.maxCacheEntries   = options.maxCacheEntries ?? 50_000;
  }

  // ── Identity resolution ───────────────────────────────────────────────────

  /**
   * Identify the caller.  Uses `req.user` when auth middleware already ran;
   * otherwise decodes a valid Bearer token so globally-mounted limiters still
   * recognise logged-in students.  Auth enforcement remains the route's own
   * responsibility.
   */
  async identify(req: Request): Promise<CallerIdentity> {
    if (req.user) return this.resolveIdentity(req, req.user);

    const header = req.headers.authorization;
    const token  = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return this.resolveIdentity(req);

    try {
      const { userId } = verifyAccessToken(token);
      const user = await this.loadUser(userId);
      return this.resolveIdentity(req, user ?? undefined);
    } catch {
      return this.resolveIdentity(req);
    }
  }

  resolveIdentity(req: Request, user: User | undefined = req.user): CallerIdentity {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (user?.did) {
      return {
        key: `did:${user.did}`,
        kind: 'did',
        userId: user.id,
        did: user.did,
        walletAddress: user.walletAddress,
        ip,
      };
    }
    if (user?.id) {
      return {
        key: `user:${user.id}`,
        kind: 'user',
        userId: user.id,
        did: null,
        walletAddress: user.walletAddress,
        ip,
      };
    }
    return { key: `ip:${ip}`, kind: 'ip', ip };
  }

  // ── Profile retrieval + caching ───────────────────────────────────────────

  async getProfile(identity: CallerIdentity): Promise<ReputationProfile> {
    const cached = this.cache.get(identity.key);
    if (cached && Date.now() - cached.computedAt < this.cacheTtlMs) return cached;
    const profile = await this.computeProfile(identity);
    this.remember(profile);
    return profile;
  }

  // ── Core scoring (BE-067 adaptive signals) ────────────────────────────────

  async computeProfile(identity: CallerIdentity): Promise<ReputationProfile> {
    const authenticated = identity.kind !== 'ip';
    const hasDid        = Boolean(identity.did);

    // Resolve all signals in parallel to minimise latency.
    const [
      verifiedStudent,
      certCount,
      activeStake,
      walletTenureMonths,
      captchaVerified,
      recentViolations,
    ] = await Promise.all([
      authenticated && identity.userId
        ? this.isVerifiedStudent(identity.userId)
        : Promise.resolve(false),

      // BE-067: certificate count for adaptive bonus.
      authenticated && identity.userId
        ? this.certificateCount(identity.userId)
        : Promise.resolve(0),

      authenticated && identity.walletAddress
        ? this.stakingProvider.hasActiveStake(identity.walletAddress)
        : Promise.resolve(false),

      // BE-067: wallet tenure bonus.
      identity.walletAddress
        ? this.walletTenure.getTenureMonths(identity.walletAddress)
        : Promise.resolve(0),

      // BE-067: CAPTCHA verification — keyed on IP for anonymous callers,
      // keyed on identity.key for authenticated callers (more stable).
      this.captchaStore.isVerified(
        identity.kind === 'ip' ? `ip:${identity.ip}` : identity.key,
      ),

      this.violations.count(identity.key),
    ]);

    // ── Build score ──────────────────────────────────────────────────────
    let score = 0;
    if (authenticated)      score += SCORE_WEIGHTS.authenticated;
    if (hasDid)             score += SCORE_WEIGHTS.did;
    if (verifiedStudent)    score += SCORE_WEIGHTS.verifiedStudent;
    if (activeStake)        score += SCORE_WEIGHTS.activeStake;

    // BE-067: wallet tenure — 1 point per month, capped at TENURE_MONTHS_CAP.
    const tenureBonus = Math.min(walletTenureMonths, TENURE_MONTHS_CAP) * SCORE_WEIGHTS.walletTenurePerMonth;
    score += tenureBonus;

    // BE-067: certificate count — 2 points per cert, capped at CERT_BONUS_CAP certs.
    const certBonus = Math.min(certCount, CERT_BONUS_CAP) * SCORE_WEIGHTS.certPerCert;
    score += certBonus;

    // BE-067: CAPTCHA flat bonus.
    if (captchaVerified)    score += SCORE_WEIGHTS.captchaVerified;

    // Violations always degrade the score.
    score += Math.min(recentViolations, MAX_COUNTED_VIOLATIONS) * SCORE_WEIGHTS.violation;

    // ── Map to tier ───────────────────────────────────────────────────────
    let tier = tierForScore(score);
    // The staker tier is reserved for authenticated DIDs with an active stake;
    // a high score alone is not enough.
    if (tier === 'staker' && !(hasDid && activeStake)) tier = 'verified';

    return {
      identity,
      score,
      tier,
      signals: {
        authenticated,
        hasDid,
        verifiedStudent,
        activeStake,
        walletTenureMonths,
        certificateCount: certCount,
        captchaVerified,
        recentViolations,
      },
      computedAt: Date.now(),
    };
  }

  // ── Violation recording ───────────────────────────────────────────────────

  /** Record a rejected request; the caller's cached profile is re-scored on the next hit. */
  async recordViolation(identity: CallerIdentity): Promise<void> {
    await this.violations.increment(identity.key);
    this.cache.delete(identity.key);
  }

  /** Drop a cached profile (e.g. after a student earns a certificate or stakes). */
  invalidate(identityKey: string): void {
    this.cache.delete(identityKey);
  }

  limitsFor(tier: ReputationTier): WindowRule[] {
    return TIER_LIMITS[tier];
  }

  // ── BE-067: CAPTCHA recording helper ──────────────────────────────────────

  /**
   * Call this from your CAPTCHA verification endpoint once the challenge is
   * solved.  The profile is invalidated so the next request re-scores the
   * caller and elevates the tier immediately.
   */
  async recordCaptchaVerification(identity: CallerIdentity): Promise<void> {
    const captchaKey = identity.kind === 'ip' ? `ip:${identity.ip}` : identity.key;
    await this.captchaStore.record(captchaKey);
    this.cache.delete(identity.key);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async loadUser(userId: string): Promise<User | null> {
    const cached = this.users.get(userId);
    if (cached && Date.now() - cached.at < this.cacheTtlMs) return cached.user;

    const user = await getStudentById(userId);
    if (this.users.size >= this.maxCacheEntries) {
      const oldestKey = this.users.keys().next().value;
      if (oldestKey !== undefined) this.users.delete(oldestKey);
    }
    this.users.set(userId, { user, at: Date.now() });
    return user;
  }

  private remember(profile: ReputationProfile): void {
    if (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(profile.identity.key, profile);
  }
}

export const reputationService = new ReputationService();
