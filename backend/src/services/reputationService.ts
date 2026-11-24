/**
 * Reputation Service — Issue BE-012
 *
 * Scores every caller (an anonymous IP or an authenticated student / DID) and
 * maps the score to a rate-limit tier. Positive signals raise the tier
 * automatically; recent rate-limit violations lower it:
 *
 *   signal                                   points
 *   ───────────────────────────────────────  ──────
 *   authenticated session                     +40
 *   linked decentralized identifier (DID)     +20
 *   verified student (≥1 active certificate)  +20
 *   active on-chain stake (Stellar asset)     +40
 *   each recent rate-limit violation          -10
 *
 *   score < 0  → restricted    score < 40  → anonymous
 *   score < 60 → authenticated score < 100 → verified
 *   score ≥ 100 → staker  (authenticated DID with an active stake)
 *
 * Profiles are cached for `REPUTATION_CACHE_TTL_MS` (default 60s) so the
 * database / Horizon are hit at most once per caller per minute.
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

export type ReputationTier = 'restricted' | 'anonymous' | 'authenticated' | 'verified' | 'staker';

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
    recentViolations: number;
  };
  computedAt: number;
}

/** Burst (1s) + sustained (60s) windows per tier. Unauthenticated IPs get strict bursts. */
export const TIER_LIMITS: Record<ReputationTier, WindowRule[]> = {
  restricted: [
    { name: 'burst', limit: 3, windowMs: 1_000 },
    { name: 'sustained', limit: 20, windowMs: 60_000 },
  ],
  anonymous: [
    { name: 'burst', limit: 10, windowMs: 1_000 },
    { name: 'sustained', limit: 60, windowMs: 60_000 },
  ],
  authenticated: [
    { name: 'burst', limit: 20, windowMs: 1_000 },
    { name: 'sustained', limit: 300, windowMs: 60_000 },
  ],
  verified: [
    { name: 'burst', limit: 40, windowMs: 1_000 },
    { name: 'sustained', limit: 600, windowMs: 60_000 },
  ],
  staker: [
    { name: 'burst', limit: 100, windowMs: 1_000 },
    { name: 'sustained', limit: 1_500, windowMs: 60_000 },
  ],
};

export const SCORE_WEIGHTS = {
  authenticated: 40,
  did: 20,
  verifiedStudent: 20,
  activeStake: 40,
  violation: -10,
} as const;

const VIOLATION_TTL_SECONDS = 3_600;
const MAX_COUNTED_VIOLATIONS = 10;

export function tierForScore(score: number): ReputationTier {
  if (score < 0) return 'restricted';
  if (score < 40) return 'anonymous';
  if (score < 60) return 'authenticated';
  if (score < 100) return 'verified';
  return 'staker';
}

/** Checks whether a Stellar account currently holds an active stake. */
export interface StakingProvider {
  hasActiveStake(walletAddress: string): Promise<boolean>;
}

/**
 * Default staking check: the wallet holds at least `STAKING_MIN_BALANCE` of the
 * staking asset (`STAKING_ASSET_CODE` issued by `STAKING_ASSET_ISSUER`).
 * Without that configuration nobody is treated as staking.
 */
export class HorizonStakingProvider implements StakingProvider {
  private readonly server: Horizon.Server;
  private readonly assetCode = process.env.STAKING_ASSET_CODE || '';
  private readonly assetIssuer = process.env.STAKING_ASSET_ISSUER || '';
  private readonly minBalance = Number(process.env.STAKING_MIN_BALANCE || '1');

  constructor(horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org') {
    this.server = new Horizon.Server(horizonUrl);
  }

  async hasActiveStake(walletAddress: string): Promise<boolean> {
    if (!this.assetCode || !this.assetIssuer) return false;
    try {
      const account = await this.server.loadAccount(walletAddress);
      return account.balances.some(
        (balance) =>
          'asset_code' in balance &&
          'asset_issuer' in balance &&
          balance.asset_code === this.assetCode &&
          balance.asset_issuer === this.assetIssuer &&
          Number(balance.balance) >= this.minBalance,
      );
    } catch (error) {
      logger.debug('Staking lookup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/** Persists recent violations so reputation decays across instances. */
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
        expiresAt: entry && entry.expiresAt > now ? entry.expiresAt : now + VIOLATION_TTL_SECONDS * 1000,
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

export interface ReputationServiceOptions {
  stakingProvider?: StakingProvider;
  violationStore?: ViolationStore;
  /** Returns true when the student has at least one active certificate. */
  isVerifiedStudent?: (userId: string) => Promise<boolean>;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
}

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

export class ReputationService {
  private readonly stakingProvider: StakingProvider;
  private readonly violations: ViolationStore;
  private readonly isVerifiedStudent: (userId: string) => Promise<boolean>;
  private readonly cacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly cache = new Map<string, ReputationProfile>();
  private readonly users = new Map<string, { user: User | null; at: number }>();

  constructor(options: ReputationServiceOptions = {}) {
    this.stakingProvider = options.stakingProvider ?? new HorizonStakingProvider();
    this.violations = options.violationStore ?? new RedisViolationStore();
    this.isVerifiedStudent = options.isVerifiedStudent ?? hasActiveCertificate;
    this.cacheTtlMs = options.cacheTtlMs ?? Number(process.env.REPUTATION_CACHE_TTL_MS || '60000');
    this.maxCacheEntries = options.maxCacheEntries ?? 50_000;
  }

  /**
   * Identify the caller. Uses `req.user` when an auth middleware already ran;
   * otherwise a valid Bearer access token is decoded (and the student loaded,
   * cached) so globally-mounted limiters still recognise logged-in students.
   * Authorization itself is still enforced by the route's own middleware.
   */
  async identify(req: Request): Promise<CallerIdentity> {
    if (req.user) return this.resolveIdentity(req, req.user);

    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
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
      return { key: `did:${user.did}`, kind: 'did', userId: user.id, did: user.did, walletAddress: user.walletAddress, ip };
    }
    if (user?.id) {
      return { key: `user:${user.id}`, kind: 'user', userId: user.id, did: null, walletAddress: user.walletAddress, ip };
    }
    return { key: `ip:${ip}`, kind: 'ip', ip };
  }

  async getProfile(identity: CallerIdentity): Promise<ReputationProfile> {
    const cached = this.cache.get(identity.key);
    if (cached && Date.now() - cached.computedAt < this.cacheTtlMs) return cached;

    const profile = await this.computeProfile(identity);
    this.remember(profile);
    return profile;
  }

  async computeProfile(identity: CallerIdentity): Promise<ReputationProfile> {
    const authenticated = identity.kind !== 'ip';
    const hasDid = Boolean(identity.did);

    const [verifiedStudent, activeStake, recentViolations] = await Promise.all([
      authenticated && identity.userId ? this.isVerifiedStudent(identity.userId) : Promise.resolve(false),
      authenticated && identity.walletAddress
        ? this.stakingProvider.hasActiveStake(identity.walletAddress)
        : Promise.resolve(false),
      this.violations.count(identity.key),
    ]);

    let score = 0;
    if (authenticated) score += SCORE_WEIGHTS.authenticated;
    if (hasDid) score += SCORE_WEIGHTS.did;
    if (verifiedStudent) score += SCORE_WEIGHTS.verifiedStudent;
    if (activeStake) score += SCORE_WEIGHTS.activeStake;
    score += Math.min(recentViolations, MAX_COUNTED_VIOLATIONS) * SCORE_WEIGHTS.violation;

    // The top tier is reserved for authenticated DIDs with an active stake.
    let tier = tierForScore(score);
    if (tier === 'staker' && !(hasDid && activeStake)) tier = 'verified';

    return {
      identity,
      score,
      tier,
      signals: { authenticated, hasDid, verifiedStudent, activeStake, recentViolations },
      computedAt: Date.now(),
    };
  }

  /** Record a rejected request; the caller's cached profile is re-scored next time. */
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
