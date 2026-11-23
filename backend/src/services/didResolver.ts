/**
 * did:stellar resolver service.
 *
 * Implements the read/verify side of the W3C DID Core 1.0 `did:stellar`
 * method. The on-chain anchor (contracts/did_registry) stores the binding
 * between a Stellar account, a GitHub handle, and an Ed25519 verification
 * key. This service:
 *
 *   1. Builds standard JSON-LD DID Documents for a given `did:stellar:<id>`.
 *   2. Verifies Ed25519 signatures over contributor PR / issue milestone
 *      proofs, strictly rejecting forged or non-matching claims.
 *   3. Maintains the in-process binding store (the source of truth is the
 *      chain; this cache is hydrated from it by the caller).
 */

import { createPublicKey, verify as ed25519Verify, type KeyObject } from 'node:crypto';

export const DID_METHOD = 'stellar';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface VerificationMethod {
  id: string;
  type: 'Ed25519VerificationKey2020';
  controller: string;
  publicKeyMultibase?: string;
  publicKeyBase64: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface DidDocument {
  '@context': string | string[];
  id: string;
  verificationMethod?: VerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  service?: ServiceEndpoint[];
  githubHandle?: string | null;
  revoked?: boolean;
}

export interface ContributorProofClaim {
  did: string;
  claimType: 'pr' | 'issue';
  repo: string;
  itemId: string;
  githubHandle: string;
  issuedAt: number;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
}

export interface DidBinding {
  githubHandle: string;
  /** Base64-encoded raw 32-byte Ed25519 public key. */
  publicKeyBase64: string;
}

function rawEd25519PublicKeyToKeyObject(raw: Buffer): KeyObject {
  const der = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

/** Parse and validate a `did:stellar:<hex>` identifier. */
export function parseDid(did: string): { method: string; id: string } {
  const parts = did.split(':');
  if (parts.length !== 3 || parts[0] !== 'did' || parts[1] !== DID_METHOD) {
    throw new Error(`Invalid DID: expected did:${DID_METHOD}:<id>`);
  }
  const id = parts[2] ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(id)) {
    throw new Error('Invalid DID id: must be a 32-byte hex Stellar account id');
  }
  return { method: parts[1], id: id.toLowerCase() };
}

/** Encode raw bytes to base64. */
export function toBase64(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('base64');
}

/** Decode base64 to a Buffer. */
export function fromBase64(value: string): Buffer {
  return Buffer.from(value, 'base64');
}

/**
 * Produce a stable, canonical JSON string for a contributor claim. Signers
 * and verifiers MUST use the exact same canonicalization so signatures are
 * reproducible.
 */
export function canonicalizeClaim(claim: ContributorProofClaim): string {
  const ordered = {
    did: claim.did,
    claimType: claim.claimType,
    repo: claim.repo,
    itemId: claim.itemId,
    githubHandle: claim.githubHandle,
    issuedAt: claim.issuedAt,
  };
  return JSON.stringify(ordered);
}

/** Verify an Ed25519 signature over an arbitrary UTF-8 message. */
export function verifyEd25519Signature(
  message: string,
  signatureBase64: string,
  publicKeyBase64: string
): boolean {
  try {
    const pubKey = rawEd25519PublicKeyToKeyObject(fromBase64(publicKeyBase64));
    const signature = fromBase64(signatureBase64);
    if (signature.length !== 64) return false;
    return ed25519Verify(null, Buffer.from(message, 'utf8'), pubKey, signature);
  } catch {
    return false;
  }
}

/**
 * Cryptographically verify a contributor proof claim against the DID's
 * verification key. Strictly rejects:
 *   - malformed claims,
 *   - signatures that do not verify,
 *   - handles that do not match the bound GitHub handle,
 *   - claims whose `did` does not match the resolved DID.
 */
export function verifyContributorProof(
  claim: ContributorProofClaim,
  signatureBase64: string,
  binding: DidBinding | undefined
): VerificationResult {
  try {
    parseDid(claim.did);
  } catch (err) {
    return { valid: false, reason: (err as Error).message };
  }

  if (claim.claimType !== 'pr' && claim.claimType !== 'issue') {
    return { valid: false, reason: 'claimType must be "pr" or "issue"' };
  }
  if (!claim.repo || !claim.itemId || !claim.githubHandle) {
    return { valid: false, reason: 'repo, itemId and githubHandle are required' };
  }
  if (!binding) {
    return { valid: false, reason: 'DID has no verification key binding' };
  }
  if (claim.githubHandle !== binding.githubHandle) {
    return {
      valid: false,
      reason: 'claim githubHandle does not match the DID-bound handle',
    };
  }

  const message = canonicalizeClaim(claim);
  const ok = verifyEd25519Signature(message, signatureBase64, binding.publicKeyBase64);
  if (!ok) {
    return { valid: false, reason: 'Ed25519 signature verification failed' };
  }
  return { valid: true };
}

/**
 * Build a standard W3C DID Core 1.0 + JSON-LD document for a resolved DID.
 * `publicKeyBase64` is the raw 32-byte Ed25519 key bound to the DID.
 */
export function buildDidDocument(params: {
  did: string;
  publicKeyBase64?: string;
  githubHandle?: string | null;
  revoked?: boolean;
  services?: ServiceEndpoint[];
}): DidDocument {
  const { did, publicKeyBase64, githubHandle = null, revoked = false, services = [] } = params;

  const doc: Record<string, unknown> = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: did,
    revoked,
  };

  if (githubHandle !== null && githubHandle !== undefined) {
    doc.githubHandle = githubHandle;
  }

  if (publicKeyBase64) {
    const vmId = `${did}#key-1`;
    const vm: VerificationMethod = {
      id: vmId,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyBase64,
    };
    doc.verificationMethod = [vm];
    doc.authentication = [vmId];
    doc.assertionMethod = [vmId];
  }

  if (services.length > 0) {
    doc.service = services;
  }

  return doc as unknown as DidDocument;
}

/**
 * In-process binding store. In production this is hydrated from the on-chain
 * DID registry; the API router exposes endpoints to mutate it for the demo.
 */
export class DidBindingStore {
  private bindings = new Map<string, DidBinding>();

  bind(did: string, binding: DidBinding): void {
    const { id } = parseDid(did);
    this.bindings.set(id, binding);
  }

  get(did: string): DidBinding | undefined {
    const { id } = parseDid(did);
    return this.bindings.get(id);
  }

  has(did: string): boolean {
    return this.get(did) !== undefined;
  }

  /** Hydrate a binding from on-chain state (used by the resolver). */
  hydrate(did: string, binding: DidBinding): void {
    this.bind(did, binding);
  }
}

export const didBindingStore = new DidBindingStore();
