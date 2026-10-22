/**
 * W3C DID resolver for the `did:stellar` and `did:soroban` methods (Issue BE-016).
 *
 *   did:stellar:<G... account id>   Stellar account. The account id *is* the
 *                                   Ed25519 public key, so the primary
 *                                   verification method is derived directly
 *                                   from the identifier — no database lookup.
 *                                   Additional account signers (Horizon) and
 *                                   registry bindings are merged when reachable.
 *   did:soroban:<C... contract id>  Soroban contract. Keys, controllers and
 *                                   revocation state are read from the on-chain
 *                                   DID registry (contracts/did_registry).
 *
 * The legacy `did:stellar:<64 hex>` form used by the contributor-proof flow is
 * accepted and normalised to the strkey form.
 *
 * Output follows the W3C DID Resolution data model: `didDocument`,
 * `didResolutionMetadata` and `didDocumentMetadata`.
 */

import { Horizon, StrKey, xdr } from '@stellar/stellar-sdk';
import { readContract } from '../blockchain/sorobanContractReader.js';
import { toMultibaseBase58, fromMultibaseBase58 } from '../certificates/Ed25519Signature2020.js';
import { HORIZON_URL } from '../config/rpcConfig.js';
import logger from '../utils/logger.js';

export const DID_CONTEXT = 'https://www.w3.org/ns/did/v1';
export const ED25519_2020_CONTEXT = 'https://w3id.org/security/suites/ed25519-2020/v1';
export const DID_RESOLUTION_CONTEXT = 'https://w3id.org/did-resolution/v1';

/** Multicodec prefix for an Ed25519 public key (0xed, varint-encoded). */
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01]);

export type SupportedDidMethod = 'stellar' | 'soroban';

export interface ParsedDid {
  did: string;
  method: SupportedDidMethod;
  /** Canonical strkey identifier (G... for accounts, C... for contracts). */
  id: string;
  /** Raw 32-byte public key (accounts) or contract hash (contracts). */
  raw: Buffer;
}

export interface Ed25519VerificationMethod {
  id: string;
  type: 'Ed25519VerificationKey2020';
  controller: string;
  publicKeyMultibase: string;
}

export interface DidService {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface ResolvedDidDocument {
  '@context': string[];
  id: string;
  controller?: string | string[];
  alsoKnownAs?: string[];
  verificationMethod: Ed25519VerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
  capabilityInvocation: string[];
  service?: DidService[];
}

export interface DidResolutionResult {
  '@context': string;
  didDocument: ResolvedDidDocument | null;
  didResolutionMetadata: {
    contentType?: 'application/did+ld+json';
    retrieved: string;
    error?: 'invalidDid' | 'methodNotSupported' | 'notFound' | 'internalError';
    message?: string;
    sources?: string[];
  };
  didDocumentMetadata: {
    deactivated?: boolean;
    created?: string;
    updated?: string;
  };
}

export class DidResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalidDid' | 'methodNotSupported'
  ) {
    super(message);
    this.name = 'DidResolutionError';
  }
}

/** On-chain registry entry as decoded from `DIDRegistryContract.resolve`. */
interface RegistryDidDocument {
  owner?: string;
  github_handle?: string | null;
  verification_key?: Buffer | Uint8Array | null;
  controllers?: string[];
  revoked?: boolean;
}

/** Encode a raw Ed25519 public key as an Ed25519VerificationKey2020 multibase value. */
export function ed25519ToMultibase(raw: Buffer): string {
  return toMultibaseBase58(Buffer.concat([ED25519_MULTICODEC_PREFIX, raw]));
}

/** Decode an Ed25519VerificationKey2020 `publicKeyMultibase` back to the raw 32-byte key. */
export function multibaseToEd25519(value: string): Buffer {
  const decoded = fromMultibaseBase58(value);
  if (
    decoded.length !== 34 ||
    decoded[0] !== ED25519_MULTICODEC_PREFIX[0] ||
    decoded[1] !== ED25519_MULTICODEC_PREFIX[1]
  ) {
    throw new Error('publicKeyMultibase is not an Ed25519 multicodec key');
  }
  return decoded.subarray(2);
}

/** Parse and validate a `did:stellar` / `did:soroban` identifier. */
export function parseStellarDid(did: string): ParsedDid {
  if (typeof did !== 'string') {
    throw new DidResolutionError('DID must be a string', 'invalidDid');
  }
  // Strip any DID URL fragment / query (e.g. did:stellar:G...#key-1).
  const base = did.split(/[#?]/)[0] ?? '';
  const parts = base.split(':');
  if (parts.length !== 3 || parts[0] !== 'did') {
    throw new DidResolutionError('Invalid DID syntax: expected did:<method>:<id>', 'invalidDid');
  }
  const method = parts[1];
  const id = parts[2] ?? '';

  if (method === 'stellar') {
    if (StrKey.isValidEd25519PublicKey(id)) {
      return { did: base, method, id, raw: Buffer.from(StrKey.decodeEd25519PublicKey(id)) };
    }
    if (/^[0-9a-fA-F]{64}$/.test(id)) {
      const raw = Buffer.from(id, 'hex');
      const accountId = StrKey.encodeEd25519PublicKey(raw);
      return { did: `did:stellar:${accountId}`, method, id: accountId, raw };
    }
    throw new DidResolutionError('Invalid did:stellar id: expected a G... Stellar account id', 'invalidDid');
  }

  if (method === 'soroban') {
    if (!StrKey.isValidContract(id)) {
      throw new DidResolutionError('Invalid did:soroban id: expected a C... Soroban contract id', 'invalidDid');
    }
    return { did: base, method, id, raw: Buffer.from(StrKey.decodeContract(id)) };
  }

  throw new DidResolutionError(`DID method "${method}" is not supported`, 'methodNotSupported');
}

/** Convert a Stellar address (G... / C...) into its DID. */
export function addressToDid(address: string): string {
  if (StrKey.isValidContract(address)) return `did:soroban:${address}`;
  return `did:stellar:${address}`;
}

function verificationMethod(did: string, fragment: string, raw: Buffer, controller = did): Ed25519VerificationMethod {
  return {
    id: `${did}#${fragment}`,
    type: 'Ed25519VerificationKey2020',
    controller,
    publicKeyMultibase: ed25519ToMultibase(raw),
  };
}

interface CacheEntry {
  expiresAt: number;
  result: DidResolutionResult;
}

export class DidResolverService {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private readonly options: {
      horizonUrl?: string;
      registryContractId?: string;
      cacheTtlMs?: number;
    } = {}
  ) {}

  private get registryContractId(): string {
    return this.options.registryContractId ?? process.env.DID_REGISTRY_CONTRACT_ID ?? '';
  }

  private get cacheTtlMs(): number {
    return this.options.cacheTtlMs ?? Number(process.env.DID_RESOLVER_CACHE_TTL_MS || '60000');
  }

  /** Resolve a DID into a W3C DID Resolution result. Never throws. */
  async resolve(did: string): Promise<DidResolutionResult> {
    const retrieved = new Date().toISOString();
    let parsed: ParsedDid;
    try {
      parsed = parseStellarDid(did);
    } catch (error) {
      const code = error instanceof DidResolutionError ? error.code : 'invalidDid';
      return this.errorResult(code, (error as Error).message, retrieved);
    }

    const cached = this.cache.get(parsed.did);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    try {
      const result =
        parsed.method === 'stellar'
          ? await this.resolveAccount(parsed, retrieved)
          : await this.resolveContract(parsed, retrieved);
      if (result.didDocument) {
        this.cache.set(parsed.did, { expiresAt: Date.now() + this.cacheTtlMs, result });
      }
      return result;
    } catch (error) {
      logger.error(`DID resolution failed for ${parsed.did}:`, error);
      return this.errorResult('internalError', 'DID resolution failed', retrieved);
    }
  }

  /**
   * Resolve a DID URL (e.g. `did:stellar:G...#key-1`) to its raw Ed25519
   * public key. Used to verify credential proofs.
   */
  async resolveVerificationKey(didUrl: string): Promise<Buffer | null> {
    const result = await this.resolve(didUrl);
    const doc = result.didDocument;
    if (!doc || result.didDocumentMetadata.deactivated) return null;

    const fragment = didUrl.includes('#') ? didUrl.slice(didUrl.indexOf('#')) : '#key-1';
    const vm = doc.verificationMethod.find((m) => m.id === `${doc.id}${fragment}`);
    if (!vm || !doc.assertionMethod.includes(vm.id)) return null;
    try {
      return multibaseToEd25519(vm.publicKeyMultibase);
    } catch {
      return null;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async resolveAccount(parsed: ParsedDid, retrieved: string): Promise<DidResolutionResult> {
    const { did } = parsed;
    const sources = ['strkey'];
    const methods: Ed25519VerificationMethod[] = [verificationMethod(did, 'key-1', parsed.raw)];
    const alsoKnownAs: string[] = [];
    let controller: string[] | undefined;
    let deactivated = false;
    let updated: string | undefined;

    // Additional signers on the account (multi-sig) become extra keys.
    const account = await this.loadAccount(parsed.id);
    if (account) {
      sources.push('horizon');
      let index = 2;
      for (const signer of account.signers) {
        if (signer.key === parsed.id || signer.weight <= 0) continue;
        if (signer.type !== 'ed25519_public_key' || !StrKey.isValidEd25519PublicKey(signer.key)) continue;
        methods.push(
          verificationMethod(
            did,
            `key-${index++}`,
            Buffer.from(StrKey.decodeEd25519PublicKey(signer.key)),
            `did:stellar:${signer.key}`
          )
        );
      }
      // A master key weight of 0 means the account key can no longer sign.
      const master = account.signers.find((s) => s.key === parsed.id);
      if (master && master.weight === 0) {
        methods.shift();
      }
      updated = (account as unknown as { last_modified_time?: string }).last_modified_time;
    }

    const registry = await this.loadRegistryEntry(parsed);
    if (registry) {
      sources.push('did-registry');
      deactivated = Boolean(registry.revoked);
      if (registry.verification_key) {
        methods.push(verificationMethod(did, 'registry-key', Buffer.from(registry.verification_key)));
      }
      if (registry.github_handle) {
        alsoKnownAs.push(`https://github.com/${registry.github_handle}`);
      }
      if (registry.controllers?.length) {
        controller = [did, ...registry.controllers.map(addressToDid)];
      }
    }

    return this.buildResult(parsed, methods, retrieved, {
      sources,
      deactivated,
      ...(updated ? { updated } : {}),
      ...(controller ? { controller } : {}),
      ...(alsoKnownAs.length ? { alsoKnownAs } : {}),
    });
  }

  private async resolveContract(parsed: ParsedDid, retrieved: string): Promise<DidResolutionResult> {
    const registry = await this.loadRegistryEntry(parsed);
    if (!registry) {
      return this.errorResult(
        'notFound',
        'did:soroban identifiers must be registered in the on-chain DID registry',
        retrieved
      );
    }

    const methods: Ed25519VerificationMethod[] = [];
    if (registry.verification_key) {
      methods.push(verificationMethod(parsed.did, 'key-1', Buffer.from(registry.verification_key)));
    }
    const controllers = [registry.owner, ...(registry.controllers ?? [])]
      .filter((c): c is string => Boolean(c))
      .map(addressToDid);

    return this.buildResult(parsed, methods, retrieved, {
      sources: ['did-registry'],
      deactivated: Boolean(registry.revoked),
      ...(controllers.length ? { controller: controllers } : {}),
      ...(registry.github_handle ? { alsoKnownAs: [`https://github.com/${registry.github_handle}`] } : {}),
    });
  }

  private buildResult(
    parsed: ParsedDid,
    methods: Ed25519VerificationMethod[],
    retrieved: string,
    extra: {
      sources: string[];
      deactivated: boolean;
      updated?: string;
      controller?: string[];
      alsoKnownAs?: string[];
    }
  ): DidResolutionResult {
    const ids = methods.map((m) => m.id);
    const didDocument: ResolvedDidDocument = {
      '@context': [DID_CONTEXT, ED25519_2020_CONTEXT],
      id: parsed.did,
      ...(extra.controller ? { controller: extra.controller } : {}),
      ...(extra.alsoKnownAs ? { alsoKnownAs: extra.alsoKnownAs } : {}),
      verificationMethod: methods,
      authentication: ids,
      assertionMethod: ids,
      capabilityInvocation: ids,
      service: [
        parsed.method === 'stellar'
          ? {
              id: `${parsed.did}#horizon`,
              type: 'StellarAccount',
              serviceEndpoint: `${this.options.horizonUrl ?? HORIZON_URL}/accounts/${parsed.id}`,
            }
          : {
              id: `${parsed.did}#contract`,
              type: 'SorobanContract',
              serviceEndpoint: `soroban:${parsed.id}`,
            },
      ],
    };

    return {
      '@context': DID_RESOLUTION_CONTEXT,
      didDocument,
      didResolutionMetadata: {
        contentType: 'application/did+ld+json',
        retrieved,
        sources: extra.sources,
      },
      didDocumentMetadata: {
        deactivated: extra.deactivated,
        ...(extra.updated ? { updated: extra.updated } : {}),
      },
    };
  }

  private errorResult(
    error: NonNullable<DidResolutionResult['didResolutionMetadata']['error']>,
    message: string,
    retrieved: string
  ): DidResolutionResult {
    return {
      '@context': DID_RESOLUTION_CONTEXT,
      didDocument: null,
      didResolutionMetadata: { retrieved, error, message },
      didDocumentMetadata: {},
    };
  }

  private async loadAccount(accountId: string): Promise<Horizon.AccountResponse | null> {
    try {
      const server = new Horizon.Server(this.options.horizonUrl ?? HORIZON_URL);
      return await server.loadAccount(accountId);
    } catch (error: any) {
      // Unfunded accounts (404) still resolve from the strkey alone.
      if (error?.response?.status !== 404) {
        logger.warn(`Horizon lookup failed for ${accountId}, resolving from strkey only`);
      }
      return null;
    }
  }

  private async loadRegistryEntry(parsed: ParsedDid): Promise<RegistryDidDocument | null> {
    const contractId = this.registryContractId;
    if (!contractId) return null;
    try {
      const entry = await readContract<RegistryDidDocument | null | undefined>(contractId, 'resolve', [
        xdr.ScVal.scvBytes(parsed.raw),
      ]);
      return entry ?? null;
    } catch (error) {
      logger.warn(`DID registry lookup failed for ${parsed.did}:`, error);
      return null;
    }
  }
}

export const didResolverService = new DidResolverService();
