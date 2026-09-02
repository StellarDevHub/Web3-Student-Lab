/**
 * Universal Stellar Public Key Checksum & Address Validator (#1114).
 *
 * Validates every Stellar address flavour before transaction construction:
 *
 *  - `G...` ed25519 public keys (StrKey CRC16-XDR checksum)
 *  - `S...` ed25519 secret seeds
 *  - `C...` Soroban contract addresses
 *  - `M...` muxed (multiplexed) addresses, decoding the 64-bit memo id
 *  - Federation handles (`username*domain.com`) resolved via SEP-0010
 *
 * Also provides a deterministic identicon generator so UIs can render a
 * stable avatar from any valid public key.
 */

import { StrKey } from '@stellar/stellar-sdk';
import { createHash } from 'crypto';

export type StellarAddressKind =
  | 'public'
  | 'secret'
  | 'contract'
  | 'muxed'
  | 'federation'
  | 'invalid';

export interface StellarAddressValidation {
  valid: boolean;
  kind: StellarAddressKind;
  /** Human-readable reason when `valid` is false. */
  reason?: string;
  /** Decoded base address for muxed addresses (`M...` -> `G...`). */
  baseAddress?: string;
  /** Decoded 64-bit memo id for muxed addresses. */
  memoId?: string;
  /** Normalized address (hex uppercase for muxed, input otherwise). */
  normalized?: string;
}

const FEDERATION_HANDLE_REGEX = /^[a-zA-Z0-9._-]+\*[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validate a single Stellar address string.
 *
 * @example
 * validateStellarAddress('GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ')
 * // => { valid: true, kind: 'public' }
 */
export function validateStellarAddress(input: string): StellarAddressValidation {
  const value = input?.trim() ?? '';

  if (!value) {
    return { valid: false, kind: 'invalid', reason: 'Address is empty' };
  }

  // Federation handles look like `alice*example.com` — no StrKey checksum.
  if (FEDERATION_HANDLE_REGEX.test(value)) {
    return { valid: true, kind: 'federation', normalized: value };
  }

  const prefix = value[0];

  try {
    switch (prefix) {
      case 'G':
        if (!StrKey.isValidEd25519PublicKey(value)) {
          return {
            valid: false,
            kind: 'invalid',
            reason: 'Invalid CRC16-XDR checksum for G... public key',
          };
        }
        return { valid: true, kind: 'public', normalized: value };

      case 'S':
        if (!StrKey.isValidEd25519SecretSeed(value)) {
          return {
            valid: false,
            kind: 'invalid',
            reason: 'Invalid CRC16-XDR checksum for S... secret seed',
          };
        }
        return { valid: true, kind: 'secret', normalized: value };

      case 'C':
        if (!StrKey.isValidContract(value)) {
          return {
            valid: false,
            kind: 'invalid',
            reason: 'Invalid CRC16-XDR checksum for C... contract address',
          };
        }
        return { valid: true, kind: 'contract', normalized: value };

      case 'M':
        return decodeMuxedAddress(value);

      default:
        return {
          valid: false,
          kind: 'invalid',
          reason: `Unsupported address prefix "${prefix}". Expected G..., S..., C..., M... or a federation handle`,
        };
    }
  } catch {
    return { valid: false, kind: 'invalid', reason: 'Malformed Stellar address' };
  }
}

/**
 * Decode a multiplexed (`M...`) Stellar address into its base `G...` account
 * and 64-bit memo id (SEP-0023). Used for exchange / memo compliance.
 */
export function decodeMuxedAddress(input: string): StellarAddressValidation {
  const value = input.trim();

  if (!StrKey.isValidMed25519PublicKey(value)) {
    return {
      valid: false,
      kind: 'invalid',
      reason: 'Invalid CRC16-XDR checksum for M... muxed address',
    };
  }

  try {
    const decoded = StrKey.decodeMed25519PublicKey(value);
    const baseAddress = StrKey.encodeEd25519PublicKey(decoded.ed25519);
    return {
      valid: true,
      kind: 'muxed',
      baseAddress,
      memoId: decoded.id.toString(),
      normalized: value,
    };
  } catch {
    return {
      valid: false,
      kind: 'invalid',
      reason: 'Failed to decode muxed address payload',
    };
  }
}

/**
 * Resolve a Stellar federation handle (`username*domain.com`) to an account
 * address following SEP-0010:
 *
 *  1. Fetch `https://<domain>/.well-known/stellar.toml` (HTTPS only)
 *  2. Read the `FEDERATION_SERVER` entry
 *  3. Query `<server>?type=name&q=<username*domain>` and return `account.id`
 *
 * Returns `null` when the handle cannot be resolved, the domain refuses
 * HTTPS, or no federation server is advertised.
 */
export async function resolveFederationHandle(
  handle: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const trimmed = handle.trim();

  if (!FEDERATION_HANDLE_REGEX.test(trimmed)) {
    return null;
  }

  const [, domain] = trimmed.split('*');
  const tomlUrl = `https://${domain}/.well-known/stellar.toml`;

  let toml: string;
  try {
    const res = await fetchImpl(tomlUrl, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return null;
    }
    toml = await res.text();
  } catch {
    // HTTPS failed — federation servers are required to serve over HTTPS,
    // so we deliberately do NOT fall back to plain HTTP (DNS rebinding
    // protection). Return null to signal an unresolved handle.
    return null;
  }

  const federationServer = parseFederationServer(toml);
  if (!federationServer) {
    return null;
  }

  try {
    const url = new URL(federationServer);
    url.searchParams.set('type', 'name');
    url.searchParams.set('q', trimmed);

    const res = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return null;
    }

    const body = (await res.json()) as { account?: { id?: string } };
    const accountId = body?.account?.id;

    if (!accountId || !StrKey.isValidEd25519PublicKey(accountId)) {
      return null;
    }
    return accountId;
  } catch {
    return null;
  }
}

/**
 * Extract the `FEDERATION_SERVER` value from a stellar.toml document.
 * Accepts both `FEDERATION_SERVER = "https://..."` and the raw URL form.
 */
export function parseFederationServer(toml: string): string | null {
  const match = toml.match(/^\s*FEDERATION_SERVER\s*=\s*["']?([^"'\s]+)["']?\s*$/m);
  const server = match?.[1];

  if (!server || !server.startsWith('https://')) {
    return null;
  }
  return server;
}

// ─── Identicon ─────────────────────────────────────────────────────────────

const IDENTICON_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#0891b2',
  '#4f46e5',
  '#c026d3',
];

/**
 * Render a deterministic identicon (5x5 grid, 8 colors) from a Stellar
 * public key. The same key always produces the same grid; the hash is
 * derived from the raw ed25519 bytes so the visual is stable across
 * sessions and renderers.
 *
 * Returns `null` for invalid public keys.
 */
export function identiconFromPublicKey(publicKey: string): string[] | null {
  const trimmed = publicKey.trim();

  if (!StrKey.isValidEd25519PublicKey(trimmed) && !StrKey.isValidMed25519PublicKey(trimmed)) {
    return null;
  }

  let raw: Buffer;
  try {
    raw = StrKey.isValidMed25519PublicKey(trimmed)
      ? Buffer.from(StrKey.decodeMed25519PublicKey(trimmed).ed25519)
      : Buffer.from(StrKey.decodeEd25519PublicKey(trimmed));
  } catch {
    return null;
  }

  const digest = createHash('sha256').update(raw).digest();

  // 5x5 symmetric grid: only 15 cells are derived, mirrored for the rest.
  const cells: string[] = new Array(25).fill(IDENTICON_COLORS[0]);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 5 + col;
      const byte = digest[idx % digest.length];
      cells[idx] = IDENTICON_COLORS[byte % IDENTICON_COLORS.length];
      // Mirror horizontally: col 4 mirrors col 0, col 3 mirrors col 1.
      cells[row * 5 + (4 - col)] = cells[idx];
    }
  }
  return cells;
}

export default validateStellarAddress;
