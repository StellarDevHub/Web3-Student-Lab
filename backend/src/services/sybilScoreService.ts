/**
 * Sybil Resistance Score aggregator (Issue BE-019).
 *
 * Combines three independent signals into one composite 0-100 score per
 * student, used to keep airdrop farmers and duplicate accounts out of grant
 * allocations and hackathon prize distributions:
 *
 *   Gitcoin Passport  (max 40)  unique-humanity stamp score
 *   World ID          (max 35)  ZK proof of personhood (orb 35, device 20)
 *   Stellar account   (max 25)  account age (10), balance above the minimum
 *                               reserve (7), aged active trustlines (8)
 *
 * Every computed score is persisted as a signed W3C Verifiable Credential
 * (the verifiable score proof). Students at or above the passing threshold
 * also receive a Sybil verification badge credential. Both verify through
 * POST /api/v1/identity/credentials/verify.
 *
 * No biometric data or raw World ID identifiers are stored: only a salted
 * digest of the action-scoped nullifier, used to stop one human from backing
 * several student accounts.
 */

import crypto from 'crypto';
import { Horizon, StrKey } from '@stellar/stellar-sdk';
import { HORIZON_URL } from '../config/rpcConfig.js';
import {
  fetchPassportScore,
  isGitcoinPassportConfigured,
  type PassportScore,
} from '../integrations/gitcoinPassport.js';
import {
  verifyWorldIdProof,
  type WorldIdProofInput,
  type WorldIdVerificationLevel,
} from '../integrations/worldId.js';
import logger from '../utils/logger.js';
import {
  credentialIssuanceService,
  type CredentialIssuanceService,
  type IssuedCredential,
} from './credentialIssuanceService.js';

export const SYBIL_SCORE_CREDENTIAL_TYPE = 'SybilResistanceScoreCredential';
export const SYBIL_BADGE_CREDENTIAL_TYPE = 'SybilVerificationBadge';

const WEIGHTS = {
  passport: 40,
  worldId: { orb: 35, device: 20 },
  stellar: { age: 10, balance: 7, trustlines: 8 },
} as const;

const STELLAR_BASE_RESERVE_XLM = 0.5;
const DAY_MS = 24 * 60 * 60 * 1000;

const config = () => ({
  passingScore: Number(process.env.SYBIL_PASSING_SCORE || '50'),
  passportFullScore: Number(process.env.SYBIL_PASSPORT_FULL_SCORE || '30'),
  fullAccountAgeDays: Number(process.env.SYBIL_FULL_ACCOUNT_AGE_DAYS || '365'),
  fullExcessBalanceXlm: Number(process.env.SYBIL_FULL_EXCESS_BALANCE_XLM || '50'),
  minTrustlineAgeDays: Number(process.env.SYBIL_MIN_TRUSTLINE_AGE_DAYS || '30'),
  fullTrustlines: Number(process.env.SYBIL_FULL_TRUSTLINES || '3'),
  scoreValidityDays: Number(process.env.SYBIL_SCORE_VALIDITY_DAYS || '90'),
});

export interface StellarAccountAnalysis {
  accountId: string;
  exists: boolean;
  accountAgeDays: number;
  createdAt?: string;
  nativeBalanceXlm: number;
  minimumBalanceXlm: number;
  excessBalanceXlm: number;
  meetsMinimumBalance: boolean;
  totalTrustlines: number;
  /** Trustlines holding a non-zero balance that are at least `minTrustlineAgeDays` old. */
  activeTrustlines: number;
}

export interface SybilScoreComponents {
  passport: { points: number; max: number; score?: number; passing?: boolean; stampCount?: number; error?: string };
  worldId: { points: number; max: number; verificationLevel?: WorldIdVerificationLevel; duplicate?: boolean; error?: string };
  stellar: {
    points: number;
    max: number;
    agePoints: number;
    balancePoints: number;
    trustlinePoints: number;
    analysis?: StellarAccountAnalysis;
    error?: string;
  };
}

export interface SybilScoreResult {
  studentId: string;
  subjectDid: string;
  score: number;
  passing: boolean;
  passingScore: number;
  components: SybilScoreComponents;
  computedAt: string;
  expiresAt: string;
  /** SHA-256 over the evidence summary embedded in the proof. */
  evidenceDigest: string;
  proof: IssuedCredential;
  badge?: IssuedCredential;
}

export interface ComputeSybilScoreInput {
  studentId: string;
  stellarAccountId: string;
  evmAddress?: string;
  worldIdProof?: WorldIdProofInput;
}

export class SybilScoreError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = 'SybilScoreError';
  }
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const ratio = (value: number, full: number): number => (full <= 0 ? 1 : Math.max(0, Math.min(value / full, 1)));

export class SybilScoreService {
  private scores = new Map<string, SybilScoreResult>();
  /** nullifier digest -> studentId: one World ID human per student account. */
  private nullifierOwners = new Map<string, string>();
  /**
   * Last successful World ID verification per student. World ID only accepts
   * a nullifier once per action, so re-scoring reuses the earlier result.
   */
  private worldIdByStudent = new Map<string, { verificationLevel: WorldIdVerificationLevel }>();

  constructor(
    private readonly issuer: CredentialIssuanceService = credentialIssuanceService,
    private readonly horizonUrl: string = HORIZON_URL
  ) {}

  /** Evaluate Stellar account age, minimum balance and active trustlines. */
  async analyzeStellarAccount(accountId: string, now: number = Date.now()): Promise<StellarAccountAnalysis> {
    const cfg = config();
    const server = new Horizon.Server(this.horizonUrl);

    let account: Horizon.AccountResponse;
    try {
      account = await server.loadAccount(accountId);
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return {
          accountId,
          exists: false,
          accountAgeDays: 0,
          nativeBalanceXlm: 0,
          minimumBalanceXlm: 0,
          excessBalanceXlm: 0,
          meetsMinimumBalance: false,
          totalTrustlines: 0,
          activeTrustlines: 0,
        };
      }
      throw error;
    }

    // The account's earliest operations: creation time and trustline ages.
    const operations = await server.operations().forAccount(accountId).order('asc').limit(200).call();
    const records = operations.records as unknown as Array<Record<string, any>>;
    const createdAt = records[0]?.created_at as string | undefined;
    const trustlineOpenedAt = new Map<string, number>();
    for (const op of records) {
      if (op.type !== 'change_trust' || !op.asset_code) continue;
      const key = `${op.asset_code}:${op.asset_issuer}`;
      if (!trustlineOpenedAt.has(key)) trustlineOpenedAt.set(key, Date.parse(op.created_at));
    }

    const native = account.balances.find((b) => b.asset_type === 'native');
    const nativeBalanceXlm = Number(native?.balance ?? 0);
    const sellingLiabilities = Number((native as { selling_liabilities?: string } | undefined)?.selling_liabilities ?? 0);
    const sponsoring = Number((account as unknown as { num_sponsoring?: number }).num_sponsoring ?? 0);
    const sponsored = Number((account as unknown as { num_sponsored?: number }).num_sponsored ?? 0);
    const minimumBalanceXlm =
      (2 + Number(account.subentry_count) + sponsoring - sponsored) * STELLAR_BASE_RESERVE_XLM;
    const excessBalanceXlm = Math.max(0, nativeBalanceXlm - minimumBalanceXlm - sellingLiabilities);

    const credit = account.balances.filter(
      (b) => b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12'
    ) as unknown as Array<{ asset_code: string; asset_issuer: string; balance: string }>;
    const minTrustlineAgeMs = cfg.minTrustlineAgeDays * DAY_MS;
    const activeTrustlines = credit.filter((line) => {
      if (Number(line.balance) <= 0) return false;
      const openedAt = trustlineOpenedAt.get(`${line.asset_code}:${line.asset_issuer}`);
      // Trustlines opened beyond the first 200 operations are old enough.
      return openedAt === undefined ? records.length >= 200 : now - openedAt >= minTrustlineAgeMs;
    }).length;

    return {
      accountId,
      exists: true,
      accountAgeDays: createdAt ? Math.max(0, Math.floor((now - Date.parse(createdAt)) / DAY_MS)) : 0,
      ...(createdAt ? { createdAt } : {}),
      nativeBalanceXlm,
      minimumBalanceXlm,
      excessBalanceXlm: round2(excessBalanceXlm),
      meetsMinimumBalance: nativeBalanceXlm - sellingLiabilities >= minimumBalanceXlm,
      totalTrustlines: credit.length,
      activeTrustlines,
    };
  }

  /** Pure scoring of the Stellar analysis. */
  scoreStellar(analysis: StellarAccountAnalysis): Omit<SybilScoreComponents['stellar'], 'max' | 'analysis'> {
    const cfg = config();
    if (!analysis.exists) {
      return { points: 0, agePoints: 0, balancePoints: 0, trustlinePoints: 0 };
    }
    const agePoints = WEIGHTS.stellar.age * ratio(analysis.accountAgeDays, cfg.fullAccountAgeDays);
    const balancePoints = analysis.meetsMinimumBalance
      ? WEIGHTS.stellar.balance * ratio(analysis.excessBalanceXlm, cfg.fullExcessBalanceXlm)
      : 0;
    const trustlinePoints = WEIGHTS.stellar.trustlines * ratio(analysis.activeTrustlines, cfg.fullTrustlines);
    return {
      points: round2(agePoints + balancePoints + trustlinePoints),
      agePoints: round2(agePoints),
      balancePoints: round2(balancePoints),
      trustlinePoints: round2(trustlinePoints),
    };
  }

  /** Pure scoring of a Gitcoin Passport result. */
  scorePassport(passport: PassportScore): number {
    return round2(WEIGHTS.passport * ratio(passport.score, config().passportFullScore));
  }

  async computeScore(input: ComputeSybilScoreInput): Promise<SybilScoreResult> {
    const cfg = config();
    if (!StrKey.isValidEd25519PublicKey(input.stellarAccountId)) {
      throw new SybilScoreError('stellarAccountId must be a valid G... Stellar account id');
    }

    const [passport, worldId, stellar] = await Promise.all([
      this.evaluatePassport(input.evmAddress),
      this.evaluateWorldId(input),
      this.evaluateStellar(input.stellarAccountId),
    ]);

    const components: SybilScoreComponents = { passport, worldId, stellar };
    const score = Math.min(100, Math.round(passport.points + worldId.points + stellar.points));
    const passing = score >= cfg.passingScore;
    const computedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + cfg.scoreValidityDays * DAY_MS).toISOString();
    const subjectDid = `did:stellar:${input.stellarAccountId}`;

    // Evidence summary: what the score was derived from, without PII.
    const evidence = {
      studentId: input.studentId,
      passport: { score: passport.score ?? null, passing: passport.passing ?? null, stamps: passport.stampCount ?? 0 },
      worldId: { verificationLevel: worldId.verificationLevel ?? null },
      stellar: stellar.analysis
        ? {
            accountAgeDays: stellar.analysis.accountAgeDays,
            meetsMinimumBalance: stellar.analysis.meetsMinimumBalance,
            excessBalanceXlm: stellar.analysis.excessBalanceXlm,
            activeTrustlines: stellar.analysis.activeTrustlines,
          }
        : null,
    };
    const evidenceDigest = crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');

    const componentPoints = {
      passport: passport.points,
      worldId: worldId.points,
      stellar: stellar.points,
    };

    const proof = this.issuer.issueCredential({
      subjectId: subjectDid,
      credentialType: SYBIL_SCORE_CREDENTIAL_TYPE,
      validUntil: expiresAt,
      claims: {
        studentId: input.studentId,
        sybilResistanceScore: score,
        passingScore: cfg.passingScore,
        passing,
        components: componentPoints,
        evidence,
        evidenceDigest,
      },
    });

    const badge = passing
      ? this.issuer.issueCredential({
          subjectId: subjectDid,
          credentialType: SYBIL_BADGE_CREDENTIAL_TYPE,
          validUntil: expiresAt,
          claims: {
            studentId: input.studentId,
            badge: 'sybil-verified',
            sybilResistanceScore: score,
            scoreProof: proof.id,
          },
        })
      : undefined;

    const result: SybilScoreResult = {
      studentId: input.studentId,
      subjectDid,
      score,
      passing,
      passingScore: cfg.passingScore,
      components,
      computedAt,
      expiresAt,
      evidenceDigest,
      proof,
      ...(badge ? { badge } : {}),
    };

    this.scores.set(input.studentId, result);
    logger.info(`Sybil score for student ${input.studentId}: ${score}${passing ? ' (badge issued)' : ''}`);
    return result;
  }

  getScore(studentId: string): SybilScoreResult | undefined {
    const result = this.scores.get(studentId);
    if (result && Date.parse(result.expiresAt) < Date.now()) {
      return undefined;
    }
    return result;
  }

  reset(): void {
    this.scores.clear();
    this.nullifierOwners.clear();
    this.worldIdByStudent.clear();
  }

  private async evaluatePassport(evmAddress?: string): Promise<SybilScoreComponents['passport']> {
    const max = WEIGHTS.passport;
    if (!evmAddress) return { points: 0, max, error: 'No EVM address provided' };
    if (!isGitcoinPassportConfigured()) return { points: 0, max, error: 'Gitcoin Passport is not configured' };
    try {
      const passport = await fetchPassportScore(evmAddress);
      return {
        points: this.scorePassport(passport),
        max,
        score: passport.score,
        passing: passport.passing,
        stampCount: passport.stampProviders.length,
      };
    } catch (error) {
      logger.warn(`Gitcoin Passport lookup failed: ${(error as Error).message}`);
      return { points: 0, max, error: (error as Error).message };
    }
  }

  private async evaluateWorldId(input: ComputeSybilScoreInput): Promise<SybilScoreComponents['worldId']> {
    const max = WEIGHTS.worldId.orb;
    if (!input.worldIdProof) {
      const previous = this.worldIdByStudent.get(input.studentId);
      if (previous) {
        return { points: WEIGHTS.worldId[previous.verificationLevel], max, verificationLevel: previous.verificationLevel };
      }
      return { points: 0, max, error: 'No World ID proof provided' };
    }

    // The signal binds the proof to this student's Stellar account.
    const verification = await verifyWorldIdProof(input.worldIdProof, input.stellarAccountId);
    if (!verification.verified || !verification.nullifierDigest || !verification.verificationLevel) {
      return { points: 0, max, error: verification.error ?? 'World ID verification failed' };
    }

    const owner = this.nullifierOwners.get(verification.nullifierDigest);
    if (owner && owner !== input.studentId) {
      return {
        points: 0,
        max,
        verificationLevel: verification.verificationLevel,
        duplicate: true,
        error: 'This World ID is already linked to another student',
      };
    }
    this.nullifierOwners.set(verification.nullifierDigest, input.studentId);
    this.worldIdByStudent.set(input.studentId, { verificationLevel: verification.verificationLevel });

    return {
      points: WEIGHTS.worldId[verification.verificationLevel],
      max,
      verificationLevel: verification.verificationLevel,
    };
  }

  private async evaluateStellar(accountId: string): Promise<SybilScoreComponents['stellar']> {
    const max = WEIGHTS.stellar.age + WEIGHTS.stellar.balance + WEIGHTS.stellar.trustlines;
    try {
      const analysis = await this.analyzeStellarAccount(accountId);
      return { ...this.scoreStellar(analysis), max, analysis };
    } catch (error) {
      logger.warn(`Stellar account analysis failed for ${accountId}: ${(error as Error).message}`);
      return {
        points: 0,
        max,
        agePoints: 0,
        balancePoints: 0,
        trustlinePoints: 0,
        error: 'Stellar account analysis failed',
      };
    }
  }
}

export const sybilScoreService = new SybilScoreService();
