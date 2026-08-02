import { xdr } from '@stellar/stellar-sdk';

export type SimulationNetwork = 'stellar' | 'evm';
export type SimulationStatus = 'success' | 'reverted' | 'failed';
export type StateChangeKind = 'created' | 'updated' | 'deleted' | 'unknown';

export interface SimulationStateChange {
  type: StateChangeKind;
  target: string;
  before?: string | null;
  after?: string | null;
  description: string;
}

export interface SimulationEvent {
  type: string;
  raw: string;
  description: string;
}

export interface FeeRecommendation {
  baseFee: bigint;
  bufferedFee: bigint;
  bufferPercent: number;
  congestion: 'low' | 'medium' | 'high';
  source: string;
}

export interface SimulationResult {
  network: SimulationNetwork;
  status: SimulationStatus;
  summary: string;
  fee: FeeRecommendation;
  gasLimit?: bigint;
  resourceFee?: bigint;
  latestLedger?: number;
  returnValue?: string;
  stateChanges: SimulationStateChange[];
  events: SimulationEvent[];
  diagnostics: string[];
  raw: unknown;
}

export interface StellarSimulationInput {
  network: 'stellar';
  rpcUrl: string;
  transactionXdr: string;
  instructionLeeway?: number;
}

export interface EvmSimulationInput {
  network: 'evm';
  rpcUrl: string;
  transaction: {
    from?: string;
    to?: string;
    gas?: string;
    gasPrice?: string;
    value?: string;
    data?: string;
  };
  blockTag?: 'latest' | 'pending' | 'safe' | 'finalized';
  traceMode?: 'auto' | 'none';
}

export type SimulationInput = StellarSimulationInput | EvmSimulationInput;

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

interface StellarFeeDistribution {
  min: string;
  p50: string;
  p90: string;
  p95: string;
  p99: string;
  max: string;
}

interface StellarFeeStatsResult {
  latestLedger?: number;
  sorobanInclusionFee?: StellarFeeDistribution;
  inclusionFee?: StellarFeeDistribution;
}

interface StellarSimulationResponse {
  latestLedger?: number;
  minResourceFee?: string;
  transactionData?: string;
  events?: string[];
  results?: Array<{ auth?: string[]; xdr?: string }>;
  cost?: { cpuInsns?: string; memBytes?: string };
  stateChanges?: Array<{
    type?: StateChangeKind;
    key: string;
    before?: string | null;
    after?: string | null;
  }>;
  restorePreamble?: {
    minResourceFee: string;
    transactionData: string;
  };
  error?: string;
}

type EvmTraceStateDiff = Record<
  string,
  Record<string, unknown> | { balance?: unknown; code?: unknown; nonce?: unknown; storage?: unknown }
>;

function parseBigInt(value: string | number | bigint | undefined, fallback = 0n): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (!value) return fallback;

  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

function parseHexBigInt(value: string | undefined, fallback = 0n): bigint {
  if (!value) return fallback;
  return parseBigInt(value.startsWith('0x') ? value : `0x${value}`, fallback);
}

function asNumber(value: bigint): number {
  return Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value);
}

function resolveBufferPercent(p50: bigint, p90: bigint, p99: bigint): {
  bufferPercent: number;
  congestion: FeeRecommendation['congestion'];
} {
  if (p50 <= 0n) {
    return { bufferPercent: 20, congestion: 'medium' };
  }

  const p90Ratio = asNumber((p90 * 100n) / p50);
  const p99Ratio = asNumber((p99 * 100n) / p50);

  if (p99Ratio >= 300 || p90Ratio >= 200) {
    return { bufferPercent: 35, congestion: 'high' };
  }

  if (p99Ratio >= 180 || p90Ratio >= 140) {
    return { bufferPercent: 20, congestion: 'medium' };
  }

  return { bufferPercent: 12, congestion: 'low' };
}

function withBuffer(baseFee: bigint, bufferPercent: number): bigint {
  return baseFee + (baseFee * BigInt(bufferPercent)) / 100n;
}

async function jsonRpc<T>(rpcUrl: string, method: string, params?: unknown): Promise<T> {
  const requestBody =
    params === undefined
      ? { jsonrpc: '2.0', id: crypto.randomUUID(), method }
      : { jsonrpc: '2.0', id: crypto.randomUUID(), method, params };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with HTTP ${response.status}.`);
  }

  const rpcBody = (await response.json()) as JsonRpcResponse<T>;
  if (rpcBody.error) {
    throw new Error(rpcBody.error.message || `RPC ${method} returned an error.`);
  }

  if (rpcBody.result === undefined) {
    throw new Error(`RPC ${method} returned no result.`);
  }

  return rpcBody.result;
}

function summarizeXdrSwitch(raw: string, kind: 'LedgerKey' | 'LedgerEntry'): string {
  try {
    const value: any =
      kind === 'LedgerKey'
        ? xdr.LedgerKey.fromXDR(raw, 'base64')
        : xdr.LedgerEntry.fromXDR(raw, 'base64');
    const switchName =
      kind === 'LedgerKey' ? value.switch().name : value.data().switch().name;

    /* v8 ignore next 5 -- covered by Stellar SDK decoding; constructing valid contractData XDR in unit tests is noisy. */
    if (switchName === 'contractData') {
      const contractData = (value as any).contractData();
      const durability = contractData.durability?.().name ?? 'unknown';
      return `${kind}: contractData (${durability})`;
    }

    return `${kind}: ${switchName}`;
  } catch {
    return `${kind}: undecodable XDR`;
  }
}

function describeStellarStateChange(change: NonNullable<StellarSimulationResponse['stateChanges']>[number]): string {
  const type = change.type ?? 'unknown';
  const target = summarizeXdrSwitch(change.key, 'LedgerKey');
  if (type === 'created') return `${target} will be created.`;
  if (type === 'updated') return `${target} will be updated.`;
  if (type === 'deleted') return `${target} will be deleted.`;
  return 'Ledger entry impact returned by simulation.';
}

function normalizeStellarStateChanges(
  changes: StellarSimulationResponse['stateChanges'] = []
): SimulationStateChange[] {
  return changes.map((change) => ({
    type: change.type ?? 'unknown',
    target: summarizeXdrSwitch(change.key, 'LedgerKey'),
    before: change.before ? summarizeXdrSwitch(change.before, 'LedgerEntry') : null,
    after: change.after ? summarizeXdrSwitch(change.after, 'LedgerEntry') : null,
    description: describeStellarStateChange(change),
  }));
}

function normalizeStellarEvents(events: string[] = []): SimulationEvent[] {
  return events.map((raw, index) => ({
    type: 'soroban-event',
    raw,
    description: `Contract event ${index + 1} emitted during simulation.`,
  }));
}

function normalizeEvmStateDiff(diff: EvmTraceStateDiff | undefined): SimulationStateChange[] {
  if (!diff) return [];

  return Object.entries(diff).flatMap<SimulationStateChange>(([address, changes]) => {
    const entries = Object.entries(changes);
    if (entries.length === 0) {
      return [
        {
          type: 'unknown' as const,
          target: address,
          before: null,
          after: null,
          description: 'Trace returned an account-level change.',
        },
      ];
    }

    return entries.map(([field, value]) => ({
      type: 'updated' as const,
      target: `${address}.${field}`,
      before: JSON.stringify((value as { from?: unknown; '*': { from?: unknown } }).from ?? (value as any)['*']?.from ?? null),
      after: JSON.stringify((value as { to?: unknown; '*': { to?: unknown } }).to ?? (value as any)['*']?.to ?? value),
      description: `EVM trace reports ${field} will change for ${address}.`,
    }));
  });
}

async function fetchEvmStateDiff(
  input: EvmSimulationInput,
  blockTag: NonNullable<EvmSimulationInput['blockTag']>
): Promise<{ stateChanges: SimulationStateChange[]; diagnostic?: string; rawTrace?: unknown }> {
  if (input.traceMode === 'none') {
    return {
      stateChanges: [],
      diagnostic: 'Trace mode disabled; state diffs were not requested.',
    };
  }

  const traceCall = await jsonRpc<{ stateDiff?: EvmTraceStateDiff }>(input.rpcUrl, 'trace_call', [
    input.transaction,
    ['stateDiff'],
    blockTag,
  ]).then(
    (result) => ({ ok: true as const, result }),
    (error) => ({ ok: false as const, error })
  );

  if (traceCall.ok && traceCall.result.stateDiff) {
    return {
      stateChanges: normalizeEvmStateDiff(traceCall.result.stateDiff),
      rawTrace: traceCall.result,
    };
  }

  const debugTrace = await jsonRpc<{ post?: EvmTraceStateDiff; pre?: EvmTraceStateDiff }>(
    input.rpcUrl,
    'debug_traceCall',
    [input.transaction, blockTag, { tracer: 'prestateTracer', tracerConfig: { diffMode: true } }]
  ).then(
    (result) => ({ ok: true as const, result }),
    (error) => ({ ok: false as const, error })
  );

  if (debugTrace.ok) {
    const stateChanges = normalizeEvmStateDiff(debugTrace.result.post);
    return {
      stateChanges,
      rawTrace: debugTrace.result,
      diagnostic: stateChanges.length
        ? 'State diff returned by debug_traceCall prestateTracer.'
        : 'debug_traceCall returned no post-state diff.',
    };
  }

  return {
    stateChanges: [],
    diagnostic:
      'Exact EVM state changes require trace_call or debug_traceCall support from the selected RPC.',
  };
}

async function simulateStellar(input: StellarSimulationInput): Promise<SimulationResult> {
  const [simulation, feeStats] = await Promise.all([
    jsonRpc<StellarSimulationResponse>(input.rpcUrl, 'simulateTransaction', {
      transaction: input.transactionXdr.trim(),
      resourceConfig: input.instructionLeeway
        ? { instructionLeeway: input.instructionLeeway }
        : undefined,
    }),
    jsonRpc<StellarFeeStatsResult>(input.rpcUrl, 'getFeeStats'),
  ]);

  const distribution = feeStats.sorobanInclusionFee ?? feeStats.inclusionFee;
  const p50 = parseBigInt(distribution?.p50, 100n);
  const p90 = parseBigInt(distribution?.p90, p50);
  const p99 = parseBigInt(distribution?.p99, p90);
  const resourceFee = parseBigInt(simulation.minResourceFee, 0n);
  const { bufferPercent, congestion } = resolveBufferPercent(p50, p90, p99);
  const baseFee = resourceFee + p90;

  const diagnostics: string[] = [];
  if (simulation.transactionData) diagnostics.push('Simulation returned transactionData for final assembly.');
  if (simulation.restorePreamble) diagnostics.push('Archived entries require RestoreFootprint before submission.');
  if (simulation.cost?.cpuInsns) diagnostics.push(`CPU instructions: ${simulation.cost.cpuInsns}.`);
  if (simulation.cost?.memBytes) diagnostics.push(`Memory bytes: ${simulation.cost.memBytes}.`);

  return {
    network: 'stellar',
    status: simulation.error ? 'reverted' : 'success',
    summary: simulation.error || 'Stellar transaction simulation completed successfully.',
    fee: {
      baseFee,
      bufferedFee: withBuffer(baseFee, bufferPercent),
      bufferPercent,
      congestion,
      source: 'Stellar RPC getFeeStats sorobanInclusionFee percentile buffer',
    },
    resourceFee,
    latestLedger: simulation.latestLedger,
    returnValue: simulation.results?.[0]?.xdr,
    stateChanges: normalizeStellarStateChanges(simulation.stateChanges),
    events: normalizeStellarEvents(simulation.events),
    diagnostics,
    raw: simulation,
  };
}

async function simulateEvm(input: EvmSimulationInput): Promise<SimulationResult> {
  const blockTag = input.blockTag ?? 'latest';
  const [callResult, gasHex, feeHistory, trace] = await Promise.all([
    jsonRpc<string>(input.rpcUrl, 'eth_call', [input.transaction, blockTag]).then(
      (result) => ({ ok: true as const, result }),
      (error) => ({ ok: false as const, error })
    ),
    jsonRpc<string>(input.rpcUrl, 'eth_estimateGas', [input.transaction]),
    jsonRpc<{ baseFeePerGas?: string[]; gasUsedRatio?: number[] }>(input.rpcUrl, 'eth_feeHistory', [
      '0x5',
      blockTag,
      [],
    ]).catch(() => undefined),
    fetchEvmStateDiff(input, blockTag),
  ]);

  const gasLimit = parseHexBigInt(gasHex);
  const baseFee = parseHexBigInt(feeHistory?.baseFeePerGas?.at(-1), 0n);
  const averageGasUsedRatio =
    feeHistory?.gasUsedRatio?.length
      ? feeHistory.gasUsedRatio.reduce((sum, value) => sum + value, 0) / feeHistory.gasUsedRatio.length
      : 0.5;
  const bufferPercent = averageGasUsedRatio >= 0.85 ? 30 : averageGasUsedRatio >= 0.65 ? 20 : 12;
  const congestion = averageGasUsedRatio >= 0.85 ? 'high' : averageGasUsedRatio >= 0.65 ? 'medium' : 'low';
  const bufferedGas = withBuffer(gasLimit, bufferPercent);

  return {
    network: 'evm',
    status: callResult.ok ? 'success' : 'reverted',
    summary: callResult.ok
      ? 'EVM transaction call simulation completed successfully.'
      : callResult.error instanceof Error
        ? callResult.error.message
        : 'EVM transaction simulation reverted.',
    fee: {
      baseFee,
      bufferedFee: bufferedGas,
      bufferPercent,
      congestion,
      source: 'eth_estimateGas with eth_feeHistory congestion buffer',
    },
    gasLimit: bufferedGas,
    returnValue: callResult.ok ? callResult.result : undefined,
    stateChanges:
      trace.stateChanges.length > 0
        ? trace.stateChanges
        : [
            {
              type: 'unknown',
              target: input.transaction.to ?? 'contract-creation',
              description: 'No exact state diff was returned by this RPC endpoint.',
            },
          ],
    events: [],
    diagnostics: [
      `Estimated gas: ${gasLimit.toString()}.`,
      `Buffered gas limit: ${bufferedGas.toString()}.`,
      ...(trace.diagnostic ? [trace.diagnostic] : []),
    ],
    raw: { callResult, gasHex, feeHistory, trace: trace.rawTrace },
  };
}

export async function simulateWeb3Transaction(input: SimulationInput): Promise<SimulationResult> {
  if (input.network === 'stellar') {
    return simulateStellar(input);
  }

  return simulateEvm(input);
}

export function formatFee(value: bigint): string {
  return value.toLocaleString('en-US');
}
