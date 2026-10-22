/**
 * Passkey (FIDO2 / WebAuthn) Authentication Service — BE-008
 *
 * Implements the relying-party side of the W3C WebAuthn registration (§7.1)
 * and authentication (§7.2) ceremonies for platform passkeys (Touch ID,
 * Face ID, Windows Hello) and roaming security keys (YubiKey).
 *
 * Replay protection: every ceremony starts with a 32-byte random challenge
 * stored in PostgreSQL with a 60-second TTL. A challenge is consumed with an
 * atomic DELETE before anything else is verified, so it can be used at most
 * once even under concurrent submissions.
 *
 * Clone detection: the authenticator's signature counter must strictly
 * increase (unless both stored and received counters are zero, which the
 * spec allows for authenticators without counters). A regression flags the
 * credential (`cloneDetectedAt`) and it is refused from then on. The counter
 * update itself is a compare-and-set on the stored value, so two concurrent
 * assertions replaying the same counter cannot both succeed.
 */

import { randomBytes } from 'crypto';
import prisma from '../db/index.js';
import {
  decodeAttestationObject,
  fromBase64Url,
  parseAuthenticatorData,
  parseCoseKey,
  sha256,
  SUPPORTED_ALGORITHMS,
  toBase64Url,
  verifyAttestation,
  verifySignature,
  WebAuthnError,
  type AuthenticatorData,
} from './webauthn.js';

export const CHALLENGE_TTL_MS = 60_000;
const CHALLENGE_BYTES = 32;

type Ceremony = 'registration' | 'authentication';
type UserVerification = 'required' | 'preferred' | 'discouraged';

export interface PasskeyConfig {
  rpId: string;
  rpName: string;
  /** Exact origins (scheme://host[:port]) allowed to run ceremonies. */
  origins: string[];
  userVerification: UserVerification;
  attestation: 'none' | 'direct';
  challengeTtlMs: number;
}

export function loadPasskeyConfig(env: NodeJS.ProcessEnv = process.env): PasskeyConfig {
  const frontend = env.FRONTEND_URL || 'http://localhost:3000';
  const origins = (env.WEBAUTHN_ORIGINS || frontend)
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  let defaultRpId = 'localhost';
  try {
    defaultRpId = new URL(frontend).hostname;
  } catch {
    // keep localhost
  }
  return {
    rpId: env.WEBAUTHN_RP_ID || defaultRpId,
    rpName: env.WEBAUTHN_RP_NAME || 'Web3 Student Lab',
    origins,
    userVerification: env.WEBAUTHN_USER_VERIFICATION === 'preferred' ? 'preferred' : 'required',
    attestation: env.WEBAUTHN_ATTESTATION === 'direct' ? 'direct' : 'none',
    challengeTtlMs: CHALLENGE_TTL_MS,
  };
}

// ---------------------------------------------------------------------------
// Persistence surface (subset of the Prisma client, so tests can fake it)
// ---------------------------------------------------------------------------

export interface ChallengeRow {
  challenge: string;
  ceremony: string;
  studentId: string | null;
  expiresAt: Date;
}

export interface CredentialRow {
  id: string;
  studentId: string;
  credentialId: string;
  publicKey: Uint8Array;
  algorithm: number;
  signCount: bigint;
  transports: string[];
  aaguid: string | null;
  attestationFormat: string;
  attestationType: string;
  userVerified: boolean;
  backupEligible: boolean;
  backedUp: boolean;
  deviceName: string | null;
  cloneDetectedAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface StudentRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface PasskeyDb {
  webAuthnChallenge: {
    create(args: { data: ChallengeRow }): Promise<unknown>;
    delete(args: { where: { challenge: string } }): Promise<ChallengeRow>;
    deleteMany(args: { where: { expiresAt: { lt: Date } } }): Promise<{ count: number }>;
  };
  webAuthnCredential: {
    findUnique(args: { where: { credentialId: string } }): Promise<CredentialRow | null>;
    findMany(args: { where: { studentId: string }; orderBy?: { createdAt: 'asc' | 'desc' } }): Promise<CredentialRow[]>;
    create(args: { data: Omit<CredentialRow, 'id' | 'createdAt' | 'lastUsedAt' | 'cloneDetectedAt'> }): Promise<CredentialRow>;
    updateMany(args: {
      where: { id: string; signCount?: bigint; cloneDetectedAt?: null };
      data: Partial<Pick<CredentialRow, 'signCount' | 'lastUsedAt' | 'backedUp' | 'userVerified' | 'cloneDetectedAt'>>;
    }): Promise<{ count: number }>;
    deleteMany(args: { where: { id: string; studentId: string } }): Promise<{ count: number }>;
  };
  student: {
    findUnique(args: {
      where: { id: string } | { email: string };
      select: { id: true; email: true; firstName: true; lastName: true };
    }): Promise<StudentRow | null>;
  };
}

// ---------------------------------------------------------------------------
// WebAuthn JSON shapes (PublicKeyCredential.toJSON(), WebAuthn L3)
// ---------------------------------------------------------------------------

export interface RegistrationResponseJSON {
  id: string;
  rawId: string;
  type: 'public-key';
  response: { clientDataJSON: string; attestationObject: string; transports?: string[] };
  authenticatorAttachment?: string;
  clientExtensionResults?: Record<string, unknown>;
}

export interface AuthenticationResponseJSON {
  id: string;
  rawId: string;
  type: 'public-key';
  response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string | null };
  authenticatorAttachment?: string;
  clientExtensionResults?: Record<string, unknown>;
}

interface CredentialDescriptorJSON {
  type: 'public-key';
  id: string;
  transports?: string[];
}

export interface PasskeyCredentialSummary {
  id: string;
  credentialId: string;
  deviceName: string | null;
  algorithm: number;
  attestationFormat: string;
  attestationType: string;
  aaguid: string | null;
  transports: string[];
  backedUp: boolean;
  signCount: number;
  createdAt: Date;
  lastUsedAt: Date | null;
  cloneDetected: boolean;
}

const KNOWN_TRANSPORTS = new Set(['usb', 'nfc', 'ble', 'smart-card', 'hybrid', 'internal']);

const toSummary = (row: CredentialRow): PasskeyCredentialSummary => ({
  id: row.id,
  credentialId: row.credentialId,
  deviceName: row.deviceName,
  algorithm: row.algorithm,
  attestationFormat: row.attestationFormat,
  attestationType: row.attestationType,
  aaguid: row.aaguid,
  transports: row.transports,
  backedUp: row.backedUp,
  signCount: Number(row.signCount),
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
  cloneDetected: row.cloneDetectedAt !== null,
});

const formatAaguid = (bytes: Buffer): string | null => {
  if (bytes.every((b) => b === 0)) return null;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const isPrismaNotFound = (err: unknown) => (err as { code?: string })?.code === 'P2025';

interface ClientData {
  type: string;
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
}

export class PasskeyService {
  constructor(
    private readonly db: PasskeyDb = prisma as unknown as PasskeyDb,
    private readonly config: PasskeyConfig = loadPasskeyConfig(),
    private readonly now: () => number = Date.now
  ) {}

  // -------------------------------------------------------------------------
  // Challenges
  // -------------------------------------------------------------------------

  private async issueChallenge(ceremony: Ceremony, studentId: string | null): Promise<string> {
    const nowMs = this.now();
    // Opportunistic cleanup keeps the table tiny without a cron job.
    await this.db.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date(nowMs) } } }).catch(() => undefined);

    const challenge = toBase64Url(randomBytes(CHALLENGE_BYTES));
    await this.db.webAuthnChallenge.create({
      data: { challenge, ceremony, studentId, expiresAt: new Date(nowMs + this.config.challengeTtlMs) },
    });
    return challenge;
  }

  /** Atomically deletes the challenge; it is spent whether or not the rest of the ceremony succeeds. */
  private async consumeChallenge(challenge: string, ceremony: Ceremony): Promise<ChallengeRow> {
    let row: ChallengeRow;
    try {
      row = await this.db.webAuthnChallenge.delete({ where: { challenge } });
    } catch (err) {
      if (isPrismaNotFound(err)) {
        throw new WebAuthnError('challenge-invalid', 'Challenge is unknown or has already been used');
      }
      throw err;
    }
    if (row.ceremony !== ceremony) {
      throw new WebAuthnError('challenge-invalid', 'Challenge was issued for a different ceremony');
    }
    if (row.expiresAt.getTime() <= this.now()) {
      throw new WebAuthnError('challenge-expired', 'Challenge has expired');
    }
    return row;
  }

  // -------------------------------------------------------------------------
  // Shared verification steps
  // -------------------------------------------------------------------------

  private parseClientData(encoded: string, expectedType: string): { clientData: ClientData; hash: Buffer } {
    const raw = fromBase64Url(encoded, 'clientDataJSON');
    let clientData: ClientData;
    try {
      clientData = JSON.parse(raw.toString('utf8')) as ClientData;
    } catch {
      throw new WebAuthnError('invalid-client-data', 'clientDataJSON is not valid JSON');
    }
    if (clientData.type !== expectedType) {
      throw new WebAuthnError('invalid-client-data', `clientData.type must be '${expectedType}'`);
    }
    if (typeof clientData.challenge !== 'string' || !clientData.challenge) {
      throw new WebAuthnError('invalid-client-data', 'clientData.challenge is missing');
    }
    if (!this.config.origins.includes(clientData.origin)) {
      throw new WebAuthnError('origin-mismatch', `Origin '${clientData.origin}' is not allowed`);
    }
    if (clientData.crossOrigin === true) {
      throw new WebAuthnError('origin-mismatch', 'Cross-origin ceremonies are not allowed');
    }
    return { clientData, hash: sha256(raw) };
  }

  private assertAuthenticatorData(authData: AuthenticatorData): void {
    if (!authData.rpIdHash.equals(sha256(Buffer.from(this.config.rpId, 'utf8')))) {
      throw new WebAuthnError('rp-id-mismatch', 'Authenticator data was produced for a different RP ID');
    }
    if (!authData.flags.userPresent) {
      throw new WebAuthnError('user-not-present', 'User presence flag is not set');
    }
    if (this.config.userVerification === 'required' && !authData.flags.userVerified) {
      throw new WebAuthnError('user-not-verified', 'User verification (biometric/PIN) is required');
    }
  }

  private assertCredentialEnvelope(response: { id: string; rawId: string; type: string }): void {
    if (response.type !== 'public-key') throw new WebAuthnError('invalid-credential', "type must be 'public-key'");
    if (response.id !== response.rawId) throw new WebAuthnError('invalid-credential', 'id and rawId differ');
    fromBase64Url(response.rawId, 'rawId');
  }

  // -------------------------------------------------------------------------
  // Registration (§7.1)
  // -------------------------------------------------------------------------

  async generateRegistrationOptions(studentId: string) {
    const student = await this.db.student.findUnique({
      where: { id: studentId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!student) throw new WebAuthnError('unknown-user', 'Student not found');

    const existing = await this.db.webAuthnCredential.findMany({ where: { studentId } });
    const challenge = await this.issueChallenge('registration', studentId);
    const displayName = `${student.firstName} ${student.lastName}`.trim() || student.email;

    return {
      challenge,
      rp: { id: this.config.rpId, name: this.config.rpName },
      // The user handle is the opaque student id — never PII.
      user: { id: toBase64Url(Buffer.from(student.id, 'utf8')), name: student.email, displayName },
      pubKeyCredParams: SUPPORTED_ALGORITHMS.map((alg) => ({ type: 'public-key' as const, alg })),
      timeout: this.config.challengeTtlMs,
      excludeCredentials: existing.map(
        (c): CredentialDescriptorJSON => ({ type: 'public-key', id: c.credentialId, transports: c.transports })
      ),
      authenticatorSelection: {
        // No attachment constraint: platform passkeys and roaming keys (YubiKey) both work.
        residentKey: 'preferred' as const,
        requireResidentKey: false,
        userVerification: this.config.userVerification,
      },
      attestation: this.config.attestation,
      extensions: { credProps: true },
    };
  }

  async verifyRegistration(
    studentId: string,
    response: RegistrationResponseJSON,
    deviceName?: string
  ): Promise<PasskeyCredentialSummary> {
    this.assertCredentialEnvelope(response);
    const { clientData, hash } = this.parseClientData(response.response.clientDataJSON, 'webauthn.create');
    const challenge = await this.consumeChallenge(clientData.challenge, 'registration');
    if (challenge.studentId !== studentId) {
      throw new WebAuthnError('challenge-invalid', 'Challenge was issued to a different user');
    }

    const { fmt, attStmt, authData: rawAuthData } = decodeAttestationObject(
      fromBase64Url(response.response.attestationObject, 'attestationObject')
    );
    const authData = parseAuthenticatorData(rawAuthData);
    this.assertAuthenticatorData(authData);

    const attested = authData.attestedCredential;
    if (!attested) throw new WebAuthnError('invalid-attestation', 'Attested credential data is missing');
    if (toBase64Url(attested.credentialId) !== response.rawId) {
      throw new WebAuthnError('invalid-credential', 'Credential ID does not match the attested credential');
    }

    const credentialKey = parseCoseKey(attested.publicKey);
    if (!SUPPORTED_ALGORITHMS.includes(credentialKey.alg)) {
      throw new WebAuthnError('unsupported-algorithm', `Algorithm ${credentialKey.alg} was not offered`);
    }

    const attestation = verifyAttestation({
      fmt,
      attStmt,
      authData,
      clientDataHash: hash,
      credentialKey,
      now: new Date(this.now()),
    });

    if (await this.db.webAuthnCredential.findUnique({ where: { credentialId: response.rawId } })) {
      throw new WebAuthnError('credential-exists', 'This authenticator is already registered');
    }

    const transports = (response.response.transports ?? []).filter((t) => KNOWN_TRANSPORTS.has(t));
    const created = await this.db.webAuthnCredential.create({
      data: {
        studentId,
        credentialId: response.rawId,
        publicKey: attested.publicKey,
        algorithm: credentialKey.alg,
        signCount: BigInt(authData.signCount),
        transports,
        aaguid: formatAaguid(attested.aaguid),
        attestationFormat: attestation.fmt,
        attestationType: attestation.type,
        userVerified: authData.flags.userVerified,
        backupEligible: authData.flags.backupEligible,
        backedUp: authData.flags.backedUp,
        deviceName: deviceName?.trim().slice(0, 100) || null,
      },
    });
    return toSummary(created);
  }

  // -------------------------------------------------------------------------
  // Authentication (§7.2)
  // -------------------------------------------------------------------------

  /**
   * With an email, the challenge is bound to that account and its passkeys
   * are listed; without one, the client uses a discoverable credential. An
   * unknown email yields an unbound challenge so account existence isn't leaked.
   */
  async generateAuthenticationOptions(email?: string) {
    let studentId: string | null = null;
    let allowCredentials: CredentialDescriptorJSON[] = [];

    if (email) {
      const student = await this.db.student.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      if (student) {
        studentId = student.id;
        const credentials = await this.db.webAuthnCredential.findMany({ where: { studentId } });
        allowCredentials = credentials
          .filter((c) => c.cloneDetectedAt === null)
          .map((c) => ({ type: 'public-key', id: c.credentialId, transports: c.transports }));
      }
    }

    const challenge = await this.issueChallenge('authentication', studentId);
    return {
      challenge,
      rpId: this.config.rpId,
      timeout: this.config.challengeTtlMs,
      userVerification: this.config.userVerification,
      allowCredentials,
    };
  }

  async verifyAuthentication(
    response: AuthenticationResponseJSON
  ): Promise<{ studentId: string; credential: PasskeyCredentialSummary }> {
    this.assertCredentialEnvelope(response);
    const { clientData, hash } = this.parseClientData(response.response.clientDataJSON, 'webauthn.get');
    const challenge = await this.consumeChallenge(clientData.challenge, 'authentication');

    const credential = await this.db.webAuthnCredential.findUnique({ where: { credentialId: response.rawId } });
    if (!credential) throw new WebAuthnError('unknown-credential', 'Passkey is not registered');
    if (credential.cloneDetectedAt) {
      throw new WebAuthnError('credential-disabled', 'Passkey was disabled after a possible clone was detected');
    }
    if (challenge.studentId && challenge.studentId !== credential.studentId) {
      throw new WebAuthnError('unknown-credential', 'Passkey does not belong to this account');
    }

    const userHandle = response.response.userHandle;
    if (userHandle) {
      if (fromBase64Url(userHandle, 'userHandle').toString('utf8') !== credential.studentId) {
        throw new WebAuthnError('user-handle-mismatch', 'userHandle does not match the passkey owner');
      }
    } else if (!challenge.studentId) {
      throw new WebAuthnError('user-handle-mismatch', 'userHandle is required for usernameless sign-in');
    }

    const authData = parseAuthenticatorData(fromBase64Url(response.response.authenticatorData, 'authenticatorData'));
    this.assertAuthenticatorData(authData);
    if (authData.flags.backupEligible !== credential.backupEligible) {
      throw new WebAuthnError('invalid-authenticator-data', 'Backup eligibility changed since registration');
    }

    const key = parseCoseKey(credential.publicKey);
    const signed = Buffer.concat([authData.raw, hash]);
    if (!verifySignature(credential.algorithm, key.key, signed, fromBase64Url(response.response.signature, 'signature'))) {
      throw new WebAuthnError('invalid-signature', 'Assertion signature is invalid');
    }

    await this.updateSignCount(credential, authData);

    return {
      studentId: credential.studentId,
      credential: toSummary({
        ...credential,
        signCount: BigInt(authData.signCount),
        backedUp: authData.flags.backedUp,
        lastUsedAt: new Date(this.now()),
      }),
    };
  }

  /** §7.2 step 21: counters must strictly increase unless the authenticator doesn't implement them (both 0). */
  private async updateSignCount(credential: CredentialRow, authData: AuthenticatorData): Promise<void> {
    const stored = credential.signCount;
    const received = BigInt(authData.signCount);

    if ((received !== 0n || stored !== 0n) && received <= stored) {
      await this.db.webAuthnCredential.updateMany({
        where: { id: credential.id },
        data: { cloneDetectedAt: new Date(this.now()) },
      });
      throw new WebAuthnError(
        'clone-detected',
        `Signature counter did not increase (stored ${stored}, received ${received}); the passkey has been disabled`
      );
    }

    // Compare-and-set: fails if another assertion advanced the counter first.
    const updated = await this.db.webAuthnCredential.updateMany({
      where: { id: credential.id, signCount: stored, cloneDetectedAt: null },
      data: {
        signCount: received,
        lastUsedAt: new Date(this.now()),
        backedUp: authData.flags.backedUp,
        userVerified: authData.flags.userVerified,
      },
    });
    if (updated.count !== 1) {
      throw new WebAuthnError('counter-race', 'Passkey was used concurrently; please try again');
    }
  }

  // -------------------------------------------------------------------------
  // Credential management
  // -------------------------------------------------------------------------

  async listCredentials(studentId: string): Promise<PasskeyCredentialSummary[]> {
    const rows = await this.db.webAuthnCredential.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toSummary);
  }

  async deleteCredential(studentId: string, id: string): Promise<boolean> {
    const { count } = await this.db.webAuthnCredential.deleteMany({ where: { id, studentId } });
    return count === 1;
  }
}

let instance: PasskeyService | null = null;

export function getPasskeyAuthService(): PasskeyService {
  if (!instance) instance = new PasskeyService();
  return instance;
}

export function setPasskeyAuthService(service: PasskeyService | null): void {
  instance = service;
}
