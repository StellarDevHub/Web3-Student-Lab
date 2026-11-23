import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';

// ─── Event Model ──────────────────────────────────────────────────────────────

/** A Soroban contract event decoded from a Stellar event stream. */
export interface DecodedContractEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  type: 'contract' | 'system' | 'diagnostic';
  topicsRaw: string[];
  topicsDecoded: any[];
  valueRaw: string;
  valueDecoded: any;
  txHash: string;
  pagingToken: string;
  timestamp: number;
}

// ─── Typed ScVal Decoding ─────────────────────────────────────────────────────

export type ScValIntegerBits = 32 | 64 | 128 | 256;

/**
 * A decoded Soroban `ScVal`. Integers are always returned as base-10 strings so
 * 64-bit and larger values survive the trip through JavaScript without losing
 * precision. Addresses are returned as their StrKey (`G...` / `C...`) form.
 */
export type DecodedScVal =
  | { type: 'integer'; value: string; signed: boolean; bits: ScValIntegerBits }
  | { type: 'symbol'; value: string }
  | { type: 'string'; value: string }
  | { type: 'address'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'bytes'; value: string }
  | { type: 'void'; value: null }
  | { type: 'vector'; value: DecodedScVal[] }
  | { type: 'map'; value: Record<string, DecodedScVal> }
  | { type: 'other'; value: unknown };

const INTEGER_SC_VAL_TYPES: Record<string, { signed: boolean; bits: ScValIntegerBits }> = {
  scvI32: { signed: true, bits: 32 },
  scvU32: { signed: false, bits: 32 },
  scvI64: { signed: true, bits: 64 },
  scvU64: { signed: false, bits: 64 },
  scvTimepoint: { signed: false, bits: 64 },
  scvDuration: { signed: false, bits: 64 },
  scvI128: { signed: true, bits: 128 },
  scvU128: { signed: false, bits: 128 },
  scvI256: { signed: true, bits: 256 },
  scvU256: { signed: false, bits: 256 },
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function tryScValToNative(val: xdr.ScVal): unknown {
  try {
    return scValToNative(val);
  } catch {
    return val.toXDR('base64');
  }
}

function mapKeyToString(key: xdr.ScVal): string {
  const decoded = decodeScValValue(key);
  switch (decoded.type) {
    case 'integer':
    case 'symbol':
    case 'string':
    case 'address':
      return decoded.value;
    case 'void':
      return 'null';
    default:
      return formatValueForDisplay(decoded.value);
  }
}

function decodeScValValue(val: xdr.ScVal): DecodedScVal {
  const kind = val.switch().name;
  const integerType = INTEGER_SC_VAL_TYPES[kind];

  if (integerType) {
    return { type: 'integer', ...integerType, value: String(scValToNative(val)) };
  }

  switch (kind) {
    case 'scvSymbol':
      return { type: 'symbol', value: val.sym().toString() };
    case 'scvString':
      return { type: 'string', value: val.str().toString() };
    case 'scvAddress':
      return { type: 'address', value: Address.fromScAddress(val.address()).toString() };
    case 'scvBool':
      return { type: 'boolean', value: val.b() };
    case 'scvBytes':
      return { type: 'bytes', value: bytesToHex(val.bytes()) };
    case 'scvVoid':
      return { type: 'void', value: null };
    case 'scvVec':
      return { type: 'vector', value: (val.vec() ?? []).map(decodeScValValue) };
    case 'scvMap':
      return {
        type: 'map',
        value: Object.fromEntries(
          (val.map() ?? []).map((entry) => [
            mapKeyToString(entry.key()),
            decodeScValValue(entry.val()),
          ])
        ),
      };
    default:
      return { type: 'other', value: tryScValToNative(val) };
  }
}

/**
 * Decodes a base64-encoded `ScVal` into a typed representation.
 *
 * @throws if `base64Xdr` is not a valid base64 ScVal. Use {@link safeDecodeScVal}
 * when the input is untrusted and a fallback is preferred.
 */
export function decodeScVal(base64Xdr: string): DecodedScVal {
  return decodeScValValue(xdr.ScVal.fromXDR(base64Xdr, 'base64'));
}

/**
 * Leniently decodes a base64-encoded `ScVal` to its native JavaScript value via
 * the Stellar SDK. Returns the raw input when it cannot be decoded.
 */
export function safeDecodeScVal(base64Xdr: string): any {
  if (!base64Xdr) return null;
  try {
    const val = xdr.ScVal.fromXDR(base64Xdr, 'base64');
    return scValToNative(val);
  } catch {
    // Fallback: return raw string if not valid ScVal XDR
    return base64Xdr;
  }
}

/** Renders a decoded value as a single-line string for tables, logs and CSV. */
export function formatValueForDisplay(val: any): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}
