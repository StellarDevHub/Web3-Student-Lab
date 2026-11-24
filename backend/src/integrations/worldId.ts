/**
 * Worldcoin World ID zero-knowledge proof verification (Issue BE-019).
 *
 * POST {base}/api/v2/verify/{app_id}
 * Docs: https://docs.world.org/world-id/reference/api#verify-proof
 *
 * Privacy: World ID proofs never contain biometric data. The only identifier
 * that comes back is the action-scoped `nullifier_hash`, and we do not even
 * keep that verbatim — callers receive a salted SHA-256 digest of it, which is
 * enough to detect the same human verifying twice without storing anything
 * linkable to World ID.
 */

import crypto from 'crypto';
import { ethers } from 'ethers';

export type WorldIdVerificationLevel = 'orb' | 'device';

export interface WorldIdProofInput {
  merkle_root: string;
  nullifier_hash: string;
  proof: string;
  verification_level: WorldIdVerificationLevel;
}

export interface WorldIdVerificationResult {
  verified: boolean;
  verificationLevel?: WorldIdVerificationLevel;
  /** Salted digest of the nullifier hash; safe to persist for dedup. */
  nullifierDigest?: string;
  error?: string;
}

const HEX_FIELD = /^0x[0-9a-fA-F]{1,64}$/;

export function isWorldIdConfigured(): boolean {
  return Boolean(process.env.WORLDCOIN_APP_ID);
}

/** World ID `hashToField`: keccak256(signal) >> 8, as a 0x-prefixed 32-byte hex. */
export function hashToField(signal: string): string {
  const bytes = ethers.utils.isHexString(signal) ? signal : ethers.utils.toUtf8Bytes(signal);
  const hash = BigInt(ethers.utils.keccak256(bytes)) >> 8n;
  return `0x${hash.toString(16).padStart(64, '0')}`;
}

export function digestNullifier(nullifierHash: string): string {
  const salt = process.env.WORLDCOIN_NULLIFIER_SALT || process.env.WORLDCOIN_APP_ID || 'web3-student-lab';
  return crypto.createHmac('sha256', salt).update(nullifierHash.toLowerCase()).digest('hex');
}

/**
 * Verify a World ID proof with the Developer Portal. `signal` binds the proof
 * to the student (we use their Stellar account) so it cannot be replayed for
 * another account.
 */
export async function verifyWorldIdProof(
  input: WorldIdProofInput,
  signal: string
): Promise<WorldIdVerificationResult> {
  const appId = process.env.WORLDCOIN_APP_ID;
  if (!appId) {
    return { verified: false, error: 'WORLDCOIN_APP_ID is not configured' };
  }
  if (
    !HEX_FIELD.test(input.merkle_root) ||
    !HEX_FIELD.test(input.nullifier_hash) ||
    typeof input.proof !== 'string' ||
    !/^0x[0-9a-fA-F]+$/.test(input.proof)
  ) {
    return { verified: false, error: 'Malformed World ID proof' };
  }
  if (input.verification_level !== 'orb' && input.verification_level !== 'device') {
    return { verified: false, error: 'Unsupported verification level' };
  }

  const baseUrl = process.env.WORLDCOIN_API_URL || 'https://developer.worldcoin.org';
  const action = process.env.WORLDCOIN_ACTION || 'sybil-resistance';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.WORLDCOIN_TIMEOUT_MS || '8000'));
  timer.unref?.();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v2/verify/${encodeURIComponent(appId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merkle_root: input.merkle_root,
        nullifier_hash: input.nullifier_hash,
        proof: input.proof,
        verification_level: input.verification_level,
        action,
        signal_hash: hashToField(signal),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    return { verified: false, error: `World ID verification request failed: ${(error as Error).message}` };
  } finally {
    clearTimeout(timer);
  }

  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    code?: string;
    detail?: string;
  };

  if (!response.ok || body.success !== true) {
    return { verified: false, error: body.detail || body.code || `World ID rejected the proof (${response.status})` };
  }

  return {
    verified: true,
    verificationLevel: input.verification_level,
    nullifierDigest: digestNullifier(input.nullifier_hash),
  };
}
