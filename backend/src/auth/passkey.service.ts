/**
 * WebAuthn FIDO2 Relying Party Verification Engine (BE-070)
 *
 * Implements FIDO2/WebAuthn registration and authentication ceremonies using
 * `@simplewebauthn/server`.
 *
 * Security guarantees:
 * - One-time challenge nonces stored in Redis with a strict 120-second TTL,
 *   atomically consumed on first verification attempt (replay / expiry -> 401).
 * - Strict enforcement of `authenticatorAttachment` during registration.
 * - Full cryptographic validation of `clientDataJSON`, `authenticatorData`
 *   flags (User Present + User Verified), origin matching, and RP ID hash.
 * - Signature counter monotonicity check with immediate security lockout
 *   when a cloned authenticator (falling or non-incrementing counter) is detected.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type AuthenticatorTransportFuture,
  type AuthenticatorAttachment,
} from '@simplewebauthn/server';
import { Redis } from 'ioredis';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Strict 120-second TTL for one-time WebAuthn challenge nonces. */
export const CHALLENGE_TTL_SECONDS = 120;

const REG_CHALLENGE_PREFIX = 'passkey:reg:challenge:';
const AUTH_CHALLENGE_PREFIX = 'passkey:auth:challenge:';
const CREDENTIAL_PREFIX = 'passkey:cred:';
const USER_CREDS_PREFIX = 'passkey:user:creds:';
const LOCKOUT_PREFIX = 'passkey:lockout:';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type PasskeyErrorCode =
  | 'CHALLENGE_EXPIRED_OR_REPLAYED'
  | 'INVALID_AUTHENTICATOR_ATTACHMENT'
  | 'CREDENTIAL_NOT_FOUND'
  | 'AUTHENTICATOR_CLONED_LOCKOUT'
  | 'AUTHENTICATOR_LOCKED'
  | 'VERIFICATION_FAILED';

export class PasskeyError extends Error {
  public readonly code: PasskeyErrorCode;
  public readonly statusCode: number;

  constructor(code: PasskeyErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'PasskeyError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PasskeyServiceConfig {
  rpName: string;
  rpId: string;
  expectedOrigins: string[];
  /** Allowed authenticator attachment(s) for registration. Defaults to ['platform']. */
  allowedAttachments: AuthenticatorAttachment[];
  /** Strict challenge TTL in seconds. Defaults to 120. */
  challengeTtlSeconds: number;
}

export interface StoredPasskeyCredential {
  id: string;
  credentialId: string;
  /** Base64url-encoded COSE public key bytes */
  publicKey: string;
  signCount: number;
  userId: string;
  transports?: AuthenticatorTransportFuture[];
  authenticatorAttachment?: AuthenticatorAttachment;
  deviceType?: 'singleDevice' | 'multiDevice';
  backedUp?: boolean;
  deviceName?: string;
  locked: boolean;
  lockedAt?: string;
  lockReason?: string;
  createdAt: string;
  lastUsedAt?: string;
}

interface StoredChallenge {
  challenge: string;
  userId?: string;
  ceremony: 'registration' | 'authentication';
  createdAt: number;
  expiresAt: number;
}

export interface RegistrationVerificationResult {
  verified: true;
  credentialId: string;
  signCount: number;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  authenticatorAttachment?: AuthenticatorAttachment;
  deviceName?: string;
}

export interface AuthenticationVerificationResult {
  verified: true;
  credentialId: string;
  userId: string;
  signCount: number;
  userVerified: boolean;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
}

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

export function loadPasskeyServiceConfig(
  env: NodeJS.ProcessEnv = process.env
): PasskeyServiceConfig {
  const rpId = env.WEBAUTHN_RP_ID || 'web3-student-lab.com';
  const rpName = env.WEBAUTHN_RP_NAME || 'Web3 Student Lab';

  const rawOrigins = env.WEBAUTHN_ORIGINS || env.FRONTEND_URL || `https://${rpId}`;
  const expectedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const rawAttachments = env.WEBAUTHN_ALLOWED_ATTACHMENTS || 'platform';
  const allowedAttachments = rawAttachments
    .split(',')
    .map((a) => a.trim())
    .filter((a): a is AuthenticatorAttachment => a === 'platform' || a === 'cross-platform');

  return {
    rpName,
    rpId,
    expectedOrigins: expectedOrigins.length > 0 ? expectedOrigins : [`https://${rpId}`],
    allowedAttachments: allowedAttachments.length > 0 ? allowedAttachments : ['platform'],
    challengeTtlSeconds: CHALLENGE_TTL_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PasskeyService {
  private readonly redis: Redis;
  private readonly config: PasskeyServiceConfig;

  constructor(options?: {
    redis?: Redis;
    redisUrl?: string;
    config?: Partial<PasskeyServiceConfig>;
  }) {
    this.redis =
      options?.redis ??
      new Redis(options?.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');

    const defaults = loadPasskeyServiceConfig();
    this.config = {
      ...defaults,
      ...options?.config,
      challengeTtlSeconds: options?.config?.challengeTtlSeconds ?? CHALLENGE_TTL_SECONDS,
    };
  }

  getConfig(): Readonly<PasskeyServiceConfig> {
    return this.config;
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  async generateRegistrationChallenge(
    userId: string,
    userName: string,
    userDisplayName: string
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existingCredentials = await this.getUserCredentials(userId);
    const preferredAttachment =
      this.config.allowedAttachments.length === 1
        ? this.config.allowedAttachments[0]
        : undefined;

    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpId,
      userID: new Uint8Array(Buffer.from(userId, 'utf-8')),
      userName,
      userDisplayName,
      timeout: this.config.challengeTtlSeconds * 1000,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports,
      })),
      authenticatorSelection: {
        authenticatorAttachment: preferredAttachment,
        userVerification: 'required',
        residentKey: 'preferred',
      },
    });

    const now = Date.now();
    const challengeRecord: StoredChallenge = {
      challenge: options.challenge,
      userId,
      ceremony: 'registration',
      createdAt: now,
      expiresAt: now + this.config.challengeTtlSeconds * 1000,
    };

    const key = `${REG_CHALLENGE_PREFIX}${userId}:${options.challenge}`;
    await this.redis.setex(
      key,
      this.config.challengeTtlSeconds,
      JSON.stringify(challengeRecord)
    );

    return options;
  }

  async verifyRegistration(
    userId: string,
    challenge: string,
    response: RegistrationResponseJSON,
    deviceName?: string
  ): Promise<RegistrationVerificationResult> {
    // 1. Atomically consume the one-time challenge nonce from Redis
    const key = `${REG_CHALLENGE_PREFIX}${userId}:${challenge}`;
    const storedChallenge = await this.consumeChallenge(key, 'registration');

    if (storedChallenge.userId && storedChallenge.userId !== userId) {
      throw new PasskeyError(
        'CHALLENGE_EXPIRED_OR_REPLAYED',
        'Challenge does not belong to this user',
        401
      );
    }

    // 2. Strictly validate authenticatorAttachment
    const attachment = response.authenticatorAttachment;
    if (
      this.config.allowedAttachments.length > 0 &&
      (!attachment || !this.config.allowedAttachments.includes(attachment))
    ) {
      throw new PasskeyError(
        'INVALID_AUTHENTICATOR_ATTACHMENT',
        `Authenticator attachment '${attachment ?? 'unspecified'}' is not allowed; expected one of: ${this.config.allowedAttachments.join(', ')}`,
        400
      );
    }

    // 3. Cryptographically verify registration via @simplewebauthn/server
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: this.config.expectedOrigins,
        expectedRPID: this.config.rpId,
        expectedType: 'webauthn.create',
        requireUserPresence: true,
        requireUserVerification: true,
      });
    } catch (err: any) {
      throw new PasskeyError(
        'VERIFICATION_FAILED',
        err?.message || 'WebAuthn registration verification failed',
        400
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new PasskeyError(
        'VERIFICATION_FAILED',
        'WebAuthn registration could not be verified',
        400
      );
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    const stored: StoredPasskeyCredential = {
      id: credential.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      signCount: credential.counter,
      userId,
      transports: credential.transports,
      authenticatorAttachment: attachment,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      deviceName,
      locked: false,
      createdAt: new Date().toISOString(),
    };

    await this.saveCredential(stored);

    return {
      verified: true,
      credentialId: stored.credentialId,
      signCount: stored.signCount,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      authenticatorAttachment: attachment,
      deviceName,
    };
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  async generateAuthenticationChallenge(
    userId?: string
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    let allowCredentials: Array<{
      id: string;
      transports?: AuthenticatorTransportFuture[];
    }> = [];

    if (userId) {
      const credentials = await this.getUserCredentials(userId);
      allowCredentials = credentials
        .filter((cred) => !cred.locked)
        .map((cred) => ({
          id: cred.credentialId,
          transports: cred.transports,
        }));
    }

    const options = await generateAuthenticationOptions({
      rpID: this.config.rpId,
      timeout: this.config.challengeTtlSeconds * 1000,
      userVerification: 'required',
      allowCredentials,
    });

    const now = Date.now();
    const challengeRecord: StoredChallenge = {
      challenge: options.challenge,
      userId,
      ceremony: 'authentication',
      createdAt: now,
      expiresAt: now + this.config.challengeTtlSeconds * 1000,
    };

    const key = `${AUTH_CHALLENGE_PREFIX}${options.challenge}`;
    await this.redis.setex(
      key,
      this.config.challengeTtlSeconds,
      JSON.stringify(challengeRecord)
    );

    return options;
  }

  async verifyAuthentication(
    challenge: string,
    response: AuthenticationResponseJSON
  ): Promise<AuthenticationVerificationResult> {
    // 1. Atomically consume the one-time challenge nonce from Redis
    const key = `${AUTH_CHALLENGE_PREFIX}${challenge}`;
    const storedChallenge = await this.consumeChallenge(key, 'authentication');

    // 2. Look up credential
    const credential = await this.getCredential(response.id);
    if (!credential) {
      throw new PasskeyError('CREDENTIAL_NOT_FOUND', 'Passkey credential not found', 404);
    }

    // 3. Enforce existing security lockout
    if (credential.locked || (await this.isCredentialLocked(credential.credentialId))) {
      throw new PasskeyError(
        'AUTHENTICATOR_LOCKED',
        'This authenticator has been locked due to suspected cloning',
        403
      );
    }

    if (storedChallenge.userId && credential.userId !== storedChallenge.userId) {
      throw new PasskeyError(
        'VERIFICATION_FAILED',
        'Credential does not belong to the challenged user',
        401
      );
    }

    // 4. Pre-check signature counter monotonicity from authenticatorData
    const receivedCounter = this.extractSignCount(response.response.authenticatorData);
    if (this.isCounterRegression(credential.signCount, receivedCounter)) {
      await this.lockoutCredential(
        credential,
        `Cloned authenticator detected: counter regressed or did not advance (stored=${credential.signCount}, received=${receivedCounter})`
      );
      throw new PasskeyError(
        'AUTHENTICATOR_CLONED_LOCKOUT',
        'Cloned authenticator detected: signature counter regression triggered immediate security lockout',
        403
      );
    }

    // 5. Cryptographically verify assertion via @simplewebauthn/server
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: this.config.expectedOrigins,
        expectedRPID: this.config.rpId,
        expectedType: 'webauthn.get',
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')),
          counter: credential.signCount,
          transports: credential.transports,
        },
      });
    } catch (err: any) {
      const msg: string = err?.message || 'WebAuthn authentication verification failed';
      // @simplewebauthn/server also throws when counter does not advance
      if (/counter/i.test(msg)) {
        await this.lockoutCredential(credential, `Cloned authenticator detected: ${msg}`);
        throw new PasskeyError(
          'AUTHENTICATOR_CLONED_LOCKOUT',
          'Cloned authenticator detected: signature counter regression triggered immediate security lockout',
          403
        );
      }
      throw new PasskeyError('VERIFICATION_FAILED', msg, 400);
    }

    if (!verification.verified) {
      throw new PasskeyError(
        'VERIFICATION_FAILED',
        'WebAuthn authentication could not be verified',
        400
      );
    }

    const { newCounter, userVerified, credentialDeviceType, credentialBackedUp } =
      verification.authenticationInfo;

    // 6. Double-check counter monotonicity on verified output
    if (this.isCounterRegression(credential.signCount, newCounter)) {
      await this.lockoutCredential(
        credential,
        `Cloned authenticator detected: counter regression (stored=${credential.signCount}, received=${newCounter})`
      );
      throw new PasskeyError(
        'AUTHENTICATOR_CLONED_LOCKOUT',
        'Cloned authenticator detected: signature counter regression triggered immediate security lockout',
        403
      );
    }

    // 7. Persist updated counter and lastUsedAt
    credential.signCount = newCounter;
    credential.lastUsedAt = new Date().toISOString();
    await this.saveCredential(credential);

    return {
      verified: true,
      credentialId: credential.credentialId,
      userId: credential.userId,
      signCount: newCounter,
      userVerified,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    };
  }

  // -------------------------------------------------------------------------
  // Credential management
  // -------------------------------------------------------------------------

  async getUserCredentials(userId: string): Promise<StoredPasskeyCredential[]> {
    const ids = await this.redis.smembers(`${USER_CREDS_PREFIX}${userId}`);
    const results: StoredPasskeyCredential[] = [];
    for (const id of ids) {
      const cred = await this.getCredential(id);
      if (cred) {
        results.push(cred);
      }
    }
    return results;
  }

  async getCredential(credentialId: string): Promise<StoredPasskeyCredential | null> {
    const raw = await this.redis.get(`${CREDENTIAL_PREFIX}${credentialId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredPasskeyCredential;
  }

  async getUserCredentialCount(userId: string): Promise<number> {
    return this.redis.scard(`${USER_CREDS_PREFIX}${userId}`);
  }

  async deleteCredential(credentialId: string): Promise<boolean> {
    const cred = await this.getCredential(credentialId);
    if (!cred) return false;

    await this.redis.srem(`${USER_CREDS_PREFIX}${cred.userId}`, credentialId);
    await this.redis.del(`${CREDENTIAL_PREFIX}${credentialId}`);
    await this.redis.del(`${LOCKOUT_PREFIX}${credentialId}`);
    return true;
  }

  async isCredentialLocked(credentialId: string): Promise<boolean> {
    const lock = await this.redis.get(`${LOCKOUT_PREFIX}${credentialId}`);
    return lock !== null;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Atomically retrieves and deletes a challenge nonce from Redis so it can
   * never be replayed. Rejects missing, replayed, or expired challenges with 401.
   */
  private async consumeChallenge(
    key: string,
    expectedCeremony: 'registration' | 'authentication'
  ): Promise<StoredChallenge> {
    const results = await this.redis.multi().get(key).del(key).exec();
    const raw = results?.[0]?.[1] as string | null | undefined;

    if (!raw) {
      throw new PasskeyError(
        'CHALLENGE_EXPIRED_OR_REPLAYED',
        'WebAuthn challenge is expired, invalid, or has already been used',
        401
      );
    }

    const parsed = JSON.parse(raw) as StoredChallenge;

    if (parsed.ceremony !== expectedCeremony) {
      throw new PasskeyError(
        'CHALLENGE_EXPIRED_OR_REPLAYED',
        'WebAuthn challenge ceremony mismatch',
        401
      );
    }

    if (Date.now() > parsed.expiresAt) {
      throw new PasskeyError(
        'CHALLENGE_EXPIRED_OR_REPLAYED',
        'WebAuthn challenge has expired',
        401
      );
    }

    return parsed;
  }

  /**
   * Per W3C WebAuthn §7.2: if the stored counter is > 0 or the received counter
   * is > 0, the received counter MUST be strictly greater than the stored counter.
   * A falling or equal non-zero counter indicates a cloned authenticator.
   */
  private isCounterRegression(storedCounter: number, receivedCounter: number): boolean {
    if (storedCounter === 0 && receivedCounter === 0) {
      return false;
    }
    return receivedCounter <= storedCounter;
  }

  private extractSignCount(authenticatorDataBase64Url: string): number {
    const buf = Buffer.from(authenticatorDataBase64Url, 'base64url');
    if (buf.length < 37) {
      return 0;
    }
    return buf.readUInt32BE(33);
  }

  private async lockoutCredential(
    credential: StoredPasskeyCredential,
    reason: string
  ): Promise<void> {
    const now = new Date().toISOString();
    credential.locked = true;
    credential.lockedAt = now;
    credential.lockReason = reason;

    await this.saveCredential(credential);
    await this.redis.set(
      `${LOCKOUT_PREFIX}${credential.credentialId}`,
      JSON.stringify({
        credentialId: credential.credentialId,
        userId: credential.userId,
        lockedAt: now,
        reason,
      })
    );
  }

  private async saveCredential(credential: StoredPasskeyCredential): Promise<void> {
    await this.redis.set(
      `${CREDENTIAL_PREFIX}${credential.credentialId}`,
      JSON.stringify(credential)
    );
    await this.redis.sadd(`${USER_CREDS_PREFIX}${credential.userId}`, credential.credentialId);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let passkeyServiceInstance: PasskeyService | null = null;

export function getPasskeyService(): PasskeyService {
  if (!passkeyServiceInstance) {
    passkeyServiceInstance = new PasskeyService();
  }
  return passkeyServiceInstance;
}
