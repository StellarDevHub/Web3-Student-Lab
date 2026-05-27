/**
 * Soroban developer tools utilities
 * ScVal decoder, RPC helpers, fee stats
 */
import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';

export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';

// ─── ScVal Decoder ────────────────────────────────────────────────────────────

export type DecodedValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | DecodedValue[]
  | { [key: string]: DecodedValue };

/**
 * Recursively decode a Soroban ScVal into a JSON-friendly structure.
 */
export function decodeScVal(val: xdr.ScVal): DecodedValue {
  try {
    return scValToNative(val) as DecodedValue;
  } catch {
    // Fallback manual decode for edge cases
    switch (val.switch().name) {
      case 'scvVoid':
        return null;
      case 'scvBool':
        return val.b();
      case 'scvU32':
        return val.u32();
      case 'scvI32':
        return val.i32();
      case 'scvU64':
        return Number(val.u64().toBigInt());
      case 'scvI64':
        return Number(val.i64().toBigInt());
      case 'scvU128':
        return String(val.u128().hi().toBigInt() * BigInt(2 ** 64) + val.u128().lo().toBigInt());
      case 'scvI128':
        return String(val.i128().hi().toBigInt() * BigInt(2 ** 64) + val.i128().lo().toBigInt());
      case 'scvBytes':
        return Buffer.from(val.bytes()).toString('hex');
      case 'scvString':
        return Buffer.from(val.str()).toString('utf8');
      case 'scvSymbol':
        return val.sym().toString();
      case 'scvAddress':
        return val.address().toString();
      case 'scvVec': {
        const vec = val.vec();
        return vec ? vec.map(decodeScVal) : [];
      }
      case 'scvMap': {
        const map = val.map();
        if (!map) return {};
        const obj: { [key: string]: DecodedValue } = {};
        for (const entry of map) {
          const k = decodeScVal(entry.key());
          obj[String(k)] = decodeScVal(entry.val());
        }
        return obj;
      }
      default:
        return `<${val.switch().name}>`;
    }
  }
}

// ─── Event Types ─────────────────────────────────────────────────────────────

export interface DecodedEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  type: string;
  topics: DecodedValue[];
  value: DecodedValue;
  txHash: string;
  pagingToken: string;
}

export function decodeRpcEvent(raw: rpc.Api.EventResponse): DecodedEvent {
  const topics = raw.topic.map((t) => {
    try {
      return decodeScVal(xdr.ScVal.fromXDR(t, 'base64'));
    } catch {
      return t;
    }
  });

  let value: DecodedValue = null;
  try {
    value = decodeScVal(xdr.ScVal.fromXDR(raw.value, 'base64'));
  } catch {
    value = raw.value;
  }

  return {
    id: raw.id,
    ledger: raw.ledger,
    ledgerClosedAt: raw.ledgerClosedAt,
    contractId: raw.contractId,
    type: raw.type,
    topics,
    value,
    txHash: raw.txHash,
    pagingToken: raw.pagingToken,
  };
}

// ─── Fee Stats ────────────────────────────────────────────────────────────────

export interface FeeStats {
  timestamp: number;
  min: number;
  p10: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
}

export async function fetchFeeStats(): Promise<FeeStats> {
  const res = await fetch(`${HORIZON_URL}/fee_stats`);
  if (!res.ok) throw new Error('Failed to fetch fee stats');
  const data = await res.json();
  const lf = data.last_ledger_base_fee;
  const fp = data.fee_charged;
  return {
    timestamp: Date.now(),
    min: parseInt(fp.min || lf),
    p10: parseInt(fp.p10 || lf),
    p50: parseInt(fp.p50 || lf),
    p90: parseInt(fp.p90 || lf),
    p95: parseInt(fp.p95 || lf),
    p99: parseInt(fp.p99 || lf),
    max: parseInt(fp.max || lf),
  };
}

// ─── Storage Browser ─────────────────────────────────────────────────────────

export interface StorageEntry {
  key: DecodedValue;
  value: DecodedValue;
  durability: 'persistent' | 'temporary' | 'instance';
  rawKey: string;
  rawValue: string;
}

export async function fetchContractStorage(contractId: string): Promise<StorageEntry[]> {
  const server = new rpc.Server(SOROBAN_RPC_URL);
  // getLedgerEntries for contract data requires building the keys
  // We use getContractData which is available in stellar-sdk rpc
  const entries: StorageEntry[] = [];

  // Fetch instance storage (contract's own storage)
  try {
    const instanceKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: xdr.ScAddress.scAddressTypeContract(
          xdr.Hash.fromXDR(Buffer.from(contractId.replace(/^C/, ''), 'base64'))
        ),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      })
    );
    const result = await server.getLedgerEntries(instanceKey);
    for (const item of result.entries) {
      if (item.val.switch().name === 'contractData') {
        const cd = item.val.contractData();
        entries.push({
          key: decodeScVal(cd.key()),
          value: decodeScVal(cd.val()),
          durability: 'instance',
          rawKey: cd.key().toXDR('base64'),
          rawValue: cd.val().toXDR('base64'),
        });
      }
    }
  } catch {
    // instance storage may not exist or contract may not be found
  }

  return entries;
}
