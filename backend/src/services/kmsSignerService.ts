import {
  GetPublicKeyCommand,
  KMSClient,
  MessageType,
  SignCommand,
  SigningAlgorithmSpec,
} from '@aws-sdk/client-kms';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { createHash, randomUUID } from 'crypto';
import { VaultClient, assertVaultConfig, loadVaultConfig, type VaultConfig } from '../config/vault.js';
import logger, { auditLogger, getTraceId } from '../utils/logger.js';

/**
 * HSM custodial relayer signing engine (BE-002 / #1574).
 *
 * Every Ed25519 signature for a Stellar envelope is produced inside a
 * hardware/secure boundary — AWS KMS (`ECC_NIST_EDWARDS25519` key) or a
 * HashiCorp Vault Transit Ed25519 key. The application only sends the 32-byte
 * transaction hash and receives the detached 64-byte signature; the private
 * key never enters process memory.
 *
 * Every signing attempt (success or failure) emits a hash-chained audit
 * record carrying the provider's request id (the IAM/CloudTrail request id for
 * KMS, the Vault `request_id` for Vault) so a signature can be traced back to
 * the authorising principal.
 *
 * A software signer exists strictly for local development and tests and is
 * refused outright when `NODE_ENV=production`.
 */

export type HsmProviderName = 'aws-kms' | 'vault-transit' | 'software-dev';

/** Stellar signatures are Ed25519: exactly 64 bytes. */
export const ED25519_SIGNATURE_BYTES = 64;
const ED25519_PUBLIC_KEY_BYTES = 32;
/** DER SubjectPublicKeyInfo prefix for an Ed25519 key (RFC 8410). */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface HsmSignResult {
  signature: Buffer;
  /** Provider request id: AWS IAM/CloudTrail request id, Vault request_id, or a local id. */
  requestId: string;
  /** Identifier of the key that produced the signature (ARN/alias, transit key + version). */
  keyRef: string;
}

export interface HsmSigner {
  readonly provider: HsmProviderName;
  /** Stellar `G...` address of the custodial key. */
  getPublicKey(): Promise<string>;
  /** Produce a raw Ed25519 signature over `payload` inside the secure boundary. */
  sign(payload: Buffer): Promise<HsmSignResult>;
}

// ─── AWS KMS ─────────────────────────────────────────────────────────────────

export interface AwsKmsHsmSignerConfig {
  keyId: string;
  region?: string;
  /** Optional pinned public key; otherwise fetched once via kms:GetPublicKey. */
  publicKey?: string;
  client?: Pick<KMSClient, 'send'>;
}

export class AwsKmsHsmSigner implements HsmSigner {
  public readonly provider = 'aws-kms' as const;
  private readonly client: Pick<KMSClient, 'send'>;
  private readonly keyId: string;
  private publicKey?: string;

  constructor(config: AwsKmsHsmSignerConfig) {
    if (!config.keyId) throw new Error('AWS KMS signer requires a key id (AWS_KMS_KEY_ID)');
    this.keyId = config.keyId;
    this.publicKey = config.publicKey;
    this.client = config.client ?? new KMSClient({ region: config.region || 'us-east-1' });
  }

  public async getPublicKey(): Promise<string> {
    if (this.publicKey) return this.publicKey;

    const response = await this.client.send(new GetPublicKeyCommand({ KeyId: this.keyId }));
    if (!response.PublicKey) {
      throw new Error('KMS GetPublicKey response did not contain public key bytes');
    }

    this.publicKey = StrKey.encodeEd25519PublicKey(extractEd25519FromSpki(Buffer.from(response.PublicKey)));
    return this.publicKey;
  }

  public async sign(payload: Buffer): Promise<HsmSignResult> {
    const response = await this.client.send(
      new SignCommand({
        KeyId: this.keyId,
        Message: payload,
        // RAW + ED25519_SHA_512 is pure Ed25519 (RFC 8032), which is what Stellar expects.
        MessageType: MessageType.RAW,
        SigningAlgorithm: SigningAlgorithmSpec.ED25519_SHA_512,
      }),
    );

    if (!response.Signature) {
      throw new Error('KMS Sign response did not contain signature bytes');
    }

    return {
      signature: Buffer.from(response.Signature),
      requestId: response.$metadata?.requestId || 'unknown',
      keyRef: response.KeyId || this.keyId,
    };
  }
}

/** Strip the RFC 8410 SPKI wrapper from a DER-encoded Ed25519 public key. */
export function extractEd25519FromSpki(der: Buffer): Buffer {
  if (der.length === ED25519_PUBLIC_KEY_BYTES) return der;
  if (
    der.length !== ED25519_SPKI_PREFIX.length + ED25519_PUBLIC_KEY_BYTES ||
    !der.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    throw new Error('KMS key is not an Ed25519 key; use key spec ECC_NIST_EDWARDS25519');
  }
  return der.subarray(ED25519_SPKI_PREFIX.length);
}

// ─── HashiCorp Vault Transit ─────────────────────────────────────────────────

interface VaultTransitKeyData {
  type: string;
  latest_version: number;
  keys: Record<string, { public_key?: string } | number>;
}

export class VaultTransitHsmSigner implements HsmSigner {
  public readonly provider = 'vault-transit' as const;
  private readonly client: VaultClient;
  private readonly config: VaultConfig;
  private publicKey?: string;
  private resolvedVersion?: number;

  constructor(config: VaultConfig = loadVaultConfig(), client?: VaultClient) {
    assertVaultConfig(config);
    this.config = config;
    this.client = client ?? new VaultClient(config);
  }

  public async getPublicKey(): Promise<string> {
    if (this.publicKey) return this.publicKey;

    const { transitMountPath, transitKeyName, transitKeyVersion } = this.config;
    const response = await this.client.request<VaultTransitKeyData>(
      'GET',
      `${transitMountPath}/keys/${encodeURIComponent(transitKeyName)}`,
    );

    if (response.data.type !== 'ed25519') {
      throw new Error(`Vault transit key "${transitKeyName}" is ${response.data.type}; Stellar requires ed25519`);
    }

    const version = transitKeyVersion ?? response.data.latest_version;
    const entry = response.data.keys[String(version)];
    const rawPublicKey = typeof entry === 'object' ? entry.public_key : undefined;
    if (!rawPublicKey) {
      throw new Error(`Vault transit key "${transitKeyName}" v${version} has no public key`);
    }

    this.resolvedVersion = version;
    this.publicKey = StrKey.encodeEd25519PublicKey(Buffer.from(rawPublicKey, 'base64'));
    return this.publicKey;
  }

  public async sign(payload: Buffer): Promise<HsmSignResult> {
    const { transitMountPath, transitKeyName } = this.config;
    // Resolve the version the public key was derived from so signature and key always match.
    await this.getPublicKey();

    const response = await this.client.request<{ signature: string; key_version?: number }>(
      'POST',
      `${transitMountPath}/sign/${encodeURIComponent(transitKeyName)}`,
      { input: payload.toString('base64'), key_version: this.resolvedVersion },
    );

    const match = /^vault:v(\d+):(.+)$/.exec(response.data.signature || '');
    if (!match?.[2]) {
      throw new Error('Vault transit sign response had an unexpected signature format');
    }

    return {
      signature: Buffer.from(match[2], 'base64'),
      requestId: response.request_id,
      keyRef: `vault:${transitMountPath}/${transitKeyName}@v${match[1]}`,
    };
  }
}

// ─── Development software signer ─────────────────────────────────────────────

const DEV_ENVIRONMENTS = new Set(['development', 'test']);

/** True only for local development/testing; the software signer is refused everywhere else. */
export function isSoftwareSignerPermitted(env: NodeJS.ProcessEnv = process.env): boolean {
  return DEV_ENVIRONMENTS.has(env.NODE_ENV ?? '') && env.HSM_ALLOW_SOFTWARE_SIGNER !== 'false';
}

export class SoftwareDevSigner implements HsmSigner {
  public readonly provider = 'software-dev' as const;
  private readonly keypair: Keypair;

  constructor(secretKey?: string) {
    if (!isSoftwareSignerPermitted()) {
      throw new Error(
        `Software signer is restricted to NODE_ENV=development|test (current: ${process.env.NODE_ENV ?? 'unset'})`,
      );
    }
    const secret = secretKey ?? process.env.HSM_DEV_SIGNER_SECRET;
    this.keypair = secret ? Keypair.fromSecret(secret) : Keypair.random();
    logger.warn('HSM signer: using in-memory software key — local development/testing only');
  }

  public async getPublicKey(): Promise<string> {
    return this.keypair.publicKey();
  }

  public async sign(payload: Buffer): Promise<HsmSignResult> {
    return {
      signature: this.keypair.sign(payload),
      requestId: `local-${randomUUID()}`,
      keyRef: 'software-dev',
    };
  }
}

// ─── Audit trail ─────────────────────────────────────────────────────────────

export interface SignatureAuditRecord {
  event: 'hsm.sign';
  outcome: 'success' | 'failure';
  provider: HsmProviderName;
  keyRef: string | null;
  publicKey: string | null;
  /** IAM / Vault / local request id for the signing call. */
  iamRequestId: string | null;
  purpose: string;
  /** SHA-256 of the signed payload — never the payload itself. */
  payloadSha256: string;
  signatureSha256: string | null;
  durationMs: number;
  traceId: string | null;
  error: string | null;
  timestamp: string;
  /** Hash of the previous record, making the log tamper-evident. */
  prevHash: string;
  /** SHA-256 over this record (including prevHash). */
  hash: string;
}

export type SignatureAuditSink = (record: SignatureAuditRecord) => void | Promise<void>;

const GENESIS_HASH = '0'.repeat(64);
const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

// ─── Service ─────────────────────────────────────────────────────────────────

export interface SignContext {
  /** Free-form label for the audit trail, e.g. 'relayer-fee-bump', 'faucet'. */
  purpose?: string;
}

export interface SignedHashResult extends HsmSignResult {
  publicKey: string;
  provider: HsmProviderName;
}

/** Structural shape of a Stellar `Transaction` / `FeeBumpTransaction`. */
export interface HsmSignableTransaction {
  hash(): Buffer;
  addSignature(publicKey: string, signature: string): void;
}

export interface KmsSignerServiceOptions {
  signer?: HsmSigner;
  /** Additional audit destinations (DB, SIEM). The append-only audit file is always written. */
  auditSinks?: SignatureAuditSink[];
}

export class KmsSignerService {
  private readonly signer: HsmSigner;
  private readonly auditSinks: SignatureAuditSink[];
  private lastAuditHash = GENESIS_HASH;

  constructor(options: KmsSignerServiceOptions = {}) {
    this.signer = options.signer ?? createHsmSignerFromEnv();
    this.auditSinks = options.auditSinks ?? [];
  }

  public get provider(): HsmProviderName {
    return this.signer.provider;
  }

  public isHardwareBacked(): boolean {
    return this.signer.provider !== 'software-dev';
  }

  public getPublicKey(): Promise<string> {
    return this.signer.getPublicKey();
  }

  /**
   * Sign a payload (a Stellar transaction hash) inside the HSM boundary,
   * verify the result against the custodial public key, and audit it.
   */
  public async signHash(payload: Buffer, context: SignContext = {}): Promise<SignedHashResult> {
    const purpose = context.purpose ?? 'transaction';
    const startedAt = Date.now();
    let publicKey: string | null = null;
    let result: HsmSignResult | null = null;

    try {
      publicKey = await this.signer.getPublicKey();
      result = await this.signer.sign(payload);

      if (result.signature.length !== ED25519_SIGNATURE_BYTES) {
        throw new Error(
          `${this.signer.provider} returned a ${result.signature.length}-byte signature; ` +
            `Stellar requires ${ED25519_SIGNATURE_BYTES}-byte Ed25519 signatures`,
        );
      }
      // Defends against a misrouted key id or a compromised/misbehaving backend.
      if (!Keypair.fromPublicKey(publicKey).verify(payload, result.signature)) {
        throw new Error(`${this.signer.provider} signature failed verification against ${publicKey}`);
      }

      await this.audit('success', purpose, payload, publicKey, result, startedAt, null);
      return { ...result, publicKey, provider: this.signer.provider };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.audit('failure', purpose, payload, publicKey, result, startedAt, extractRequestId(error, message));
      logger.error(`HSM signing failed via ${this.signer.provider}: ${message}`);
      throw new Error(`HSM transaction signing failed (${this.signer.provider}): ${message}`);
    }
  }

  /** Sign a Stellar transaction or fee-bump envelope in place. */
  public async signTransaction<T extends HsmSignableTransaction>(
    transaction: T,
    context: SignContext = {},
  ): Promise<T> {
    const { signature, publicKey } = await this.signHash(transaction.hash(), context);
    transaction.addSignature(publicKey, signature.toString('base64'));
    return transaction;
  }

  private async audit(
    outcome: SignatureAuditRecord['outcome'],
    purpose: string,
    payload: Buffer,
    publicKey: string | null,
    result: HsmSignResult | null,
    startedAt: number,
    failure: { message: string; requestId: string | null } | null,
  ): Promise<void> {
    const body: Omit<SignatureAuditRecord, 'hash'> = {
      event: 'hsm.sign',
      outcome,
      provider: this.signer.provider,
      keyRef: result?.keyRef ?? null,
      publicKey,
      iamRequestId: result?.requestId ?? failure?.requestId ?? null,
      purpose,
      payloadSha256: sha256(payload),
      signatureSha256: result ? sha256(result.signature) : null,
      durationMs: Date.now() - startedAt,
      traceId: getTraceId() ?? null,
      error: failure?.message ?? null,
      timestamp: new Date().toISOString(),
      prevHash: this.lastAuditHash,
    };
    const record: SignatureAuditRecord = { ...body, hash: sha256(JSON.stringify(body)) };
    this.lastAuditHash = record.hash;

    auditLogger.info('HSM signature operation', record);

    for (const sink of this.auditSinks) {
      try {
        await sink(record);
      } catch (error) {
        // An audit sink outage must not mask the signing outcome; the file log above already holds it.
        logger.error(`HSM audit sink failed: ${(error as Error).message}`);
      }
    }
  }
}

/** Pull the AWS request id off an SDK error (`$metadata.requestId`) if present. */
function extractRequestId(error: unknown, message: string): { message: string; requestId: string | null } {
  const metadata = (error as { $metadata?: { requestId?: string } } | null)?.$metadata;
  return { message, requestId: metadata?.requestId ?? null };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Select the HSM backend from `HSM_SIGNER_PROVIDER` (`aws-kms` | `vault-transit`
 * | `software-dev`). When unset, AWS KMS is used if `AWS_KMS_KEY_ID` is set,
 * then Vault if `VAULT_ADDR` is set, and the software signer only in
 * development/test. Production without a configured HSM fails closed.
 */
export function createHsmSignerFromEnv(env: NodeJS.ProcessEnv = process.env): HsmSigner {
  const requested = env.HSM_SIGNER_PROVIDER as HsmProviderName | undefined;

  if (requested === 'aws-kms' || (!requested && env.AWS_KMS_KEY_ID)) {
    return new AwsKmsHsmSigner({
      keyId: env.AWS_KMS_KEY_ID || '',
      region: env.AWS_REGION,
      publicKey: env.PLATFORM_MASTER_PUBLIC_KEY || undefined,
    });
  }

  if (requested === 'vault-transit' || (!requested && env.VAULT_ADDR)) {
    return new VaultTransitHsmSigner(loadVaultConfig(env));
  }

  if (requested === 'software-dev' || !requested) {
    if (!isSoftwareSignerPermitted(env)) {
      throw new Error(
        'No HSM signer configured. Set HSM_SIGNER_PROVIDER=aws-kms (AWS_KMS_KEY_ID) or ' +
          'HSM_SIGNER_PROVIDER=vault-transit (VAULT_ADDR, VAULT_TRANSIT_KEY); the software signer is ' +
          'only available when NODE_ENV is development or test.',
      );
    }
    return new SoftwareDevSigner();
  }

  throw new Error(`Unknown HSM_SIGNER_PROVIDER "${requested}"`);
}

let instance: KmsSignerService | null = null;

/** Application-wide signer, constructed lazily so imports never force HSM configuration. */
export function getKmsSignerService(options?: KmsSignerServiceOptions): KmsSignerService {
  if (!instance) instance = new KmsSignerService(options);
  return instance;
}

export function resetKmsSignerService(): void {
  instance = null;
}
