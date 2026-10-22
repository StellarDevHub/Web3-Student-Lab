/**
 * W3C Verifiable Credential issuance & verification (Issue BE-016).
 *
 * Credentials follow the W3C Verifiable Credentials Data Model v2.0 and are
 * signed by the university's institutional master keypair with an
 * Ed25519Signature2020 JSON-LD proof.
 *
 * Verification is fully decentralised:
 *   1. The issuer is a `did:stellar:<G...>` DID, so its public key is resolved
 *      from the identifier itself (see didResolverService) — no database.
 *   2. The proof is checked against that key.
 *   3. Revocation is read from the Soroban certificate contract via the
 *      credential's `credentialStatus` entry.
 */

import crypto, { randomUUID } from 'crypto';
import { Keypair, StrKey, xdr } from '@stellar/stellar-sdk';
import { ContractReadError, readContract } from '../blockchain/sorobanContractReader.js';
import {
  createSignedMessage,
  deriveIssuerKeyPair,
  signMessage,
  toMultibaseBase58,
  verifySignature,
} from '../certificates/Ed25519Signature2020.js';
import {
  ASSERTION_METHOD,
  ED25519_2020_SUITE_CONTEXT,
  ED25519_SIGNATURE_2020,
  VC_TYPE,
  W3C_VC_CONTEXT_V2,
  type LinkedDataProof,
} from '../certificates/verifiableCredential.types.js';
import { API_BASE_URL, CERTIFICATE_CONTRACT_ID } from '../config/rpcConfig.js';
import logger from '../utils/logger.js';
import { didResolverService, type DidResolverService } from './didResolverService.js';

export const SOROBAN_REVOCATION_STATUS_TYPE = 'SorobanRevocationStatus';

export type OnChainCredentialStatus = 'active' | 'revoked' | 'expired' | 'reissued' | 'unknown';

export interface CredentialStatusEntry {
  id: string;
  type: typeof SOROBAN_REVOCATION_STATUS_TYPE;
  statusPurpose: 'revocation';
  /** Soroban contract holding the revocation registry. */
  contractId: string;
  /** 32-byte hex record id looked up via `get_certificate`. */
  revocationId: string;
}

export interface IssuedCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: { id: string; name?: string };
  validFrom: string;
  validUntil?: string;
  credentialSubject: { id: string } & Record<string, unknown>;
  credentialStatus?: CredentialStatusEntry;
  proof?: LinkedDataProof;
}

export interface IssueCredentialInput {
  /** DID of the student (or a G... address, normalised to did:stellar). */
  subjectId: string;
  /** Extra VC type, e.g. "CourseCompletionCredential". */
  credentialType?: string;
  claims: Record<string, unknown>;
  validFrom?: string;
  validUntil?: string;
  /** On-chain record id (32-byte hex). Defaults to sha256(credential id). */
  revocationId?: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CredentialVerificationResult {
  valid: boolean;
  issuerDid?: string;
  schema: SchemaValidationResult;
  verifiedProof: boolean;
  status: OnChainCredentialStatus;
  revocationChecked: boolean;
  reason?: string;
}

const XSD_DATETIME = /^-?\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const URL_LIKE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/;

const isUrl = (value: unknown): value is string => typeof value === 'string' && URL_LIKE.test(value);

/**
 * Structural validation against the normative requirements of the W3C VC
 * Data Model v2.0 (the same checks the W3C VC JSON schema enforces).
 */
export function validateCredentialSchema(credential: unknown): SchemaValidationResult {
  const errors: string[] = [];
  if (!credential || typeof credential !== 'object' || Array.isArray(credential)) {
    return { valid: false, errors: ['Credential must be a JSON object'] };
  }
  const vc = credential as Record<string, unknown>;

  const context = vc['@context'];
  if (!Array.isArray(context) || context[0] !== W3C_VC_CONTEXT_V2) {
    errors.push(`@context must be an array whose first item is ${W3C_VC_CONTEXT_V2}`);
  } else if (!context.every((c) => isUrl(c) || (c && typeof c === 'object'))) {
    errors.push('@context entries must be URLs or objects');
  }

  if (vc.id !== undefined && !isUrl(vc.id)) {
    errors.push('id must be a URL');
  }

  const type = vc.type;
  if (!Array.isArray(type) || !type.includes(VC_TYPE) || !type.every((t) => typeof t === 'string')) {
    errors.push(`type must be an array of strings that includes ${VC_TYPE}`);
  }

  const issuer = vc.issuer;
  const issuerId = typeof issuer === 'string' ? issuer : (issuer as Record<string, unknown> | undefined)?.id;
  if (!isUrl(issuerId)) {
    errors.push('issuer must be a URL or an object with a URL id');
  }

  const subjects = Array.isArray(vc.credentialSubject) ? vc.credentialSubject : [vc.credentialSubject];
  if (
    subjects.length === 0 ||
    !subjects.every((s) => s && typeof s === 'object' && !Array.isArray(s) && Object.keys(s).length > 0)
  ) {
    errors.push('credentialSubject must be a non-empty object or array of objects');
  } else if (!subjects.every((s) => (s as Record<string, unknown>).id === undefined || isUrl((s as Record<string, unknown>).id))) {
    errors.push('credentialSubject.id must be a URL');
  }

  for (const field of ['validFrom', 'validUntil'] as const) {
    if (vc[field] !== undefined && (typeof vc[field] !== 'string' || !XSD_DATETIME.test(vc[field] as string))) {
      errors.push(`${field} must be an XML Schema dateTimeStamp`);
    }
  }
  if (
    typeof vc.validFrom === 'string' &&
    typeof vc.validUntil === 'string' &&
    Date.parse(vc.validUntil) < Date.parse(vc.validFrom)
  ) {
    errors.push('validUntil must not be earlier than validFrom');
  }

  const statuses = vc.credentialStatus === undefined
    ? []
    : Array.isArray(vc.credentialStatus) ? vc.credentialStatus : [vc.credentialStatus];
  for (const status of statuses) {
    const entry = status as Record<string, unknown> | null;
    if (!entry || typeof entry !== 'object' || typeof entry.type !== 'string') {
      errors.push('credentialStatus entries must be objects with a type');
    } else if (entry.id !== undefined && !isUrl(entry.id)) {
      errors.push('credentialStatus.id must be a URL');
    }
  }

  const proofs = vc.proof === undefined ? [] : Array.isArray(vc.proof) ? vc.proof : [vc.proof];
  for (const proof of proofs) {
    const p = proof as Record<string, unknown> | null;
    if (!p || typeof p !== 'object' || typeof p.type !== 'string' || typeof p.proofPurpose !== 'string') {
      errors.push('proof must include type and proofPurpose');
    } else if (!isUrl(p.verificationMethod)) {
      errors.push('proof.verificationMethod must be a URL');
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Decode the certificate contract's `CertificateStatus` enum. */
function decodeStatus(value: unknown): OnChainCredentialStatus {
  const raw = Array.isArray(value) ? value[0] : value;
  switch (String(raw).toLowerCase()) {
    case 'active':
      return 'active';
    case 'revoked':
      return 'revoked';
    case 'expired':
      return 'expired';
    case 'reissued':
      return 'reissued';
    default:
      return 'unknown';
  }
}

export class CredentialIssuanceService {
  constructor(private readonly resolver: DidResolverService = didResolverService) {}

  /**
   * The institutional master keypair. `INSTITUTION_MASTER_SECRET` is a Stellar
   * secret seed (S...); its account id is the issuer DID. Falls back to the
   * platform certificate signing seed for local development.
   */
  private get issuerKeys(): { did: string; publicKey: Buffer; privateKey: crypto.KeyObject } {
    const secret = process.env.INSTITUTION_MASTER_SECRET;
    const seedHex = secret
      ? Keypair.fromSecret(secret).rawSecretKey().toString('hex')
      : process.env.CERTIFICATE_SIGNING_SEED;
    const { publicKey, privateKey } = deriveIssuerKeyPair(seedHex);
    return {
      did: `did:stellar:${StrKey.encodeEd25519PublicKey(publicKey)}`,
      publicKey,
      privateKey,
    };
  }

  private get issuerName(): string {
    return process.env.INSTITUTION_NAME || process.env.ISSUER_NAME || 'Web3 Student Lab';
  }

  private get statusContractId(): string {
    return process.env.CREDENTIAL_STATUS_CONTRACT_ID || CERTIFICATE_CONTRACT_ID;
  }

  get issuerDid(): string {
    return this.issuerKeys.did;
  }

  /** Issue and sign a W3C VC v2.0 credential. */
  issueCredential(input: IssueCredentialInput): IssuedCredential {
    const { did: issuerDid, privateKey } = this.issuerKeys;
    const subjectId = input.subjectId.startsWith('did:') ? input.subjectId : `did:stellar:${input.subjectId}`;
    const credentialId = `urn:uuid:${randomUUID()}`;
    const revocationId = (
      input.revocationId ?? crypto.createHash('sha256').update(credentialId).digest('hex')
    ).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(revocationId)) {
      throw new Error('revocationId must be a 32-byte hex string');
    }

    const { id: _ignored, ...claims } = input.claims;
    const credential: IssuedCredential = {
      '@context': [W3C_VC_CONTEXT_V2, ED25519_2020_SUITE_CONTEXT],
      id: credentialId,
      type: input.credentialType && input.credentialType !== VC_TYPE
        ? [VC_TYPE, input.credentialType]
        : [VC_TYPE],
      issuer: { id: issuerDid, name: this.issuerName },
      validFrom: input.validFrom ?? new Date().toISOString(),
      ...(input.validUntil ? { validUntil: input.validUntil } : {}),
      credentialSubject: { id: subjectId, ...claims },
    };

    if (this.statusContractId) {
      credential.credentialStatus = {
        id: `${API_BASE_URL}/api/v1/identity/credentials/status/${revocationId}`,
        type: SOROBAN_REVOCATION_STATUS_TYPE,
        statusPurpose: 'revocation',
        contractId: this.statusContractId,
        revocationId,
      };
    }

    const schema = validateCredentialSchema(credential);
    if (!schema.valid) {
      throw new Error(`Credential does not satisfy the W3C VC schema: ${schema.errors.join('; ')}`);
    }

    const proof: LinkedDataProof = {
      type: ED25519_SIGNATURE_2020,
      created: new Date().toISOString(),
      verificationMethod: `${issuerDid}#key-1`,
      proofPurpose: ASSERTION_METHOD,
      proofValue: '',
    };
    const message = createSignedMessage(
      credential as unknown as Record<string, unknown>,
      proof as unknown as Record<string, unknown>
    );
    proof.proofValue = toMultibaseBase58(signMessage(message, privateKey));

    return { ...credential, proof };
  }

  /** Look up a credential's revocation status on the Soroban contract. */
  async checkRevocationStatus(
    revocationId: string,
    contractId: string = this.statusContractId
  ): Promise<{ status: OnChainCredentialStatus; checked: boolean; reason?: string }> {
    if (!contractId) {
      return { status: 'unknown', checked: false, reason: 'No revocation contract configured' };
    }
    if (!/^[0-9a-fA-F]{64}$/.test(revocationId)) {
      return { status: 'unknown', checked: false, reason: 'revocationId must be a 32-byte hex string' };
    }
    try {
      const record = await readContract<{ status?: unknown } | null>(contractId, 'get_certificate', [
        xdr.ScVal.scvBytes(Buffer.from(revocationId, 'hex')),
      ]);
      return { status: decodeStatus(record?.status), checked: true };
    } catch (error) {
      if (error instanceof ContractReadError) {
        // The contract panics with CertificateNotFound for unanchored ids.
        return { status: 'unknown', checked: true, reason: 'Credential is not anchored on-chain' };
      }
      logger.warn(`On-chain revocation lookup failed for ${revocationId}:`, error);
      return { status: 'unknown', checked: false, reason: 'Soroban RPC unavailable' };
    }
  }

  /**
   * Verify a credential: W3C schema, Ed25519Signature2020 proof against the
   * issuer key resolved from its DID, validity window and on-chain revocation.
   */
  async verifyCredential(credential: unknown): Promise<CredentialVerificationResult> {
    const schema = validateCredentialSchema(credential);
    const base = { schema, verifiedProof: false, status: 'unknown' as OnChainCredentialStatus, revocationChecked: false };
    if (!schema.valid) {
      return { ...base, valid: false, reason: 'Credential does not satisfy the W3C VC schema' };
    }

    const vc = credential as IssuedCredential;
    const rawIssuer = (credential as { issuer: string | { id: string } }).issuer;
    const issuerDid = typeof rawIssuer === 'string' ? rawIssuer : rawIssuer.id;
    const proof = vc.proof;
    if (!proof || proof.type !== ED25519_SIGNATURE_2020 || proof.proofPurpose !== ASSERTION_METHOD) {
      return { ...base, issuerDid, valid: false, reason: `Missing or unsupported proof (expected ${ED25519_SIGNATURE_2020})` };
    }
    if (!proof.verificationMethod.startsWith(`${issuerDid}#`)) {
      return { ...base, issuerDid, valid: false, reason: 'Proof verification method does not belong to the issuer' };
    }

    const publicKey = await this.resolver.resolveVerificationKey(proof.verificationMethod);
    if (!publicKey) {
      return { ...base, issuerDid, valid: false, reason: 'Could not resolve issuer verification key from DID' };
    }

    const verifiedProof = verifySignature(
      vc as unknown as Record<string, unknown>,
      proof as unknown as Record<string, unknown>,
      publicKey
    );
    if (!verifiedProof) {
      return { ...base, issuerDid, valid: false, reason: 'Signature verification failed (tampered or forged credential)' };
    }

    const now = Date.now();
    if (Date.parse(vc.validFrom) > now) {
      return { ...base, issuerDid, verifiedProof, valid: false, reason: 'Credential is not yet valid' };
    }
    if (vc.validUntil && Date.parse(vc.validUntil) < now) {
      return { ...base, issuerDid, verifiedProof, valid: false, status: 'expired', reason: 'Credential has expired' };
    }

    const statusEntry = vc.credentialStatus;
    if (!statusEntry || statusEntry.type !== SOROBAN_REVOCATION_STATUS_TYPE) {
      return { ...base, issuerDid, verifiedProof, valid: true };
    }

    const { status, checked, reason } = await this.checkRevocationStatus(
      statusEntry.revocationId,
      statusEntry.contractId
    );
    const requireOnChain = process.env.CREDENTIAL_REQUIRE_ONCHAIN_STATUS === 'true';
    const revokedLike = status === 'revoked' || status === 'expired' || status === 'reissued';
    const valid = !revokedLike && !(requireOnChain && status !== 'active');

    return {
      valid,
      issuerDid,
      schema,
      verifiedProof,
      status,
      revocationChecked: checked,
      ...(valid ? {} : { reason: revokedLike ? `Credential status is ${status}` : reason ?? 'On-chain status could not be confirmed' }),
    };
  }

  /** Resolution result for the institutional issuer DID. */
  async getIssuerDidDocument() {
    return this.resolver.resolve(this.issuerDid);
  }
}

export const credentialIssuanceService = new CredentialIssuanceService();
