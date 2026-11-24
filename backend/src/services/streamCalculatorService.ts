/**
 * Sablier-compatible continuous payment stream calculator (Issue BE-018).
 *
 * Balances are computed in memory from the indexed stream state instead of
 * querying the database per stream, so bulk lookups over thousands of active
 * streams stay cheap.
 *
 * Math mirrors Sablier LockupLinear (and the Soroban contract) exactly:
 *
 *   t <  cliffTime            -> streamed = 0
 *   t >= endTime              -> streamed = deposit
 *   otherwise                 -> streamed = floor(deposit * (t - start) / (end - start))
 *   canceled at T             -> streamed is frozen at T (deposit - refunded)
 *   withdrawable              =  streamed - withdrawn
 *
 * Amounts are integers in the token's smallest unit (stroops: 7 decimals for
 * Stellar assets) and handled as `bigint`, so results match the contract's
 * i128 arithmetic to the last stroop — no floating point is involved.
 */

import { EventEmitter } from 'events';

export const STREAM_DECIMALS = 7;

export type StreamStatus = 'pending' | 'streaming' | 'settled' | 'canceled' | 'depleted';

export type StreamMilestone = 'cliff_reached' | 'completed';

export interface StreamRecord {
  streamId: string;
  contractId?: string;
  sender: string;
  recipient: string;
  asset?: string;
  /** Total deposit, in the token's smallest unit. */
  depositAmount: bigint;
  /** Unix timestamps in seconds (ledger close time). */
  startTime: number;
  cliffTime: number;
  endTime: number;
  withdrawnAmount: bigint;
  canceledAt?: number;
  /** Amount refunded to the sender on cancellation. */
  refundedAmount?: bigint;
  cancelable?: boolean;
  createdLedger?: number;
  updatedAt: number;
}

export interface StreamBalance {
  streamId: string;
  status: StreamStatus;
  depositAmount: string;
  streamedAmount: string;
  withdrawnAmount: string;
  withdrawableAmount: string;
  refundableAmount: string;
  /** Same values formatted with `STREAM_DECIMALS` decimal places. */
  formatted: {
    depositAmount: string;
    streamedAmount: string;
    withdrawnAmount: string;
    withdrawableAmount: string;
    refundableAmount: string;
  };
  asOf: number;
}

export interface StreamMilestoneEvent {
  milestone: StreamMilestone;
  streamId: string;
  sender: string;
  recipient: string;
  at: number;
  balance: StreamBalance;
}

export const nowInSeconds = (): number => Math.floor(Date.now() / 1000);

/** Format an integer amount with a fixed number of decimals (7 for stroops). */
export function formatAmount(amount: bigint, decimals: number = STREAM_DECIMALS): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole.toString()}${decimals > 0 ? `.${fraction}` : ''}`;
}

/** Parse a decimal string (e.g. "12.5000000") or integer into smallest units. */
export function parseAmount(value: string | number | bigint, decimals: number = STREAM_DECIMALS): bigint {
  if (typeof value === 'bigint') return value;
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Invalid amount: ${text}`);
  }
  const [whole = '0', fraction = ''] = text.replace('-', '').split('.');
  if (fraction.length > decimals) {
    throw new Error(`Amount ${text} has more than ${decimals} decimal places`);
  }
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  return text.startsWith('-') ? -units : units;
}

/** Streamed amount at time `t` per Sablier LockupLinear, ignoring cancellation. */
export function linearStreamedAmount(
  stream: Pick<StreamRecord, 'depositAmount' | 'startTime' | 'cliffTime' | 'endTime'>,
  t: number
): bigint {
  if (t < stream.cliffTime || t < stream.startTime) return 0n;
  if (t >= stream.endTime) return stream.depositAmount;
  const elapsed = BigInt(t - stream.startTime);
  const duration = BigInt(stream.endTime - stream.startTime);
  // bigint division truncates toward zero == floor for non-negative values,
  // matching the contract's integer division.
  return (stream.depositAmount * elapsed) / duration;
}

export function streamedAmount(stream: StreamRecord, t: number): bigint {
  if (stream.canceledAt !== undefined) {
    if (stream.refundedAmount !== undefined) {
      return stream.depositAmount - stream.refundedAmount;
    }
    return linearStreamedAmount(stream, Math.min(t, stream.canceledAt));
  }
  return linearStreamedAmount(stream, t);
}

export function streamStatus(stream: StreamRecord, t: number): StreamStatus {
  if (stream.canceledAt !== undefined) return 'canceled';
  if (stream.withdrawnAmount >= stream.depositAmount) return 'depleted';
  if (t >= stream.endTime) return 'settled';
  if (t < stream.startTime) return 'pending';
  return 'streaming';
}

export function computeBalance(stream: StreamRecord, t: number = nowInSeconds()): StreamBalance {
  const streamed = streamedAmount(stream, t);
  const withdrawable = streamed > stream.withdrawnAmount ? streamed - stream.withdrawnAmount : 0n;
  const refundable =
    stream.canceledAt !== undefined || t >= stream.endTime ? 0n : stream.depositAmount - streamed;

  return {
    streamId: stream.streamId,
    status: streamStatus(stream, t),
    depositAmount: stream.depositAmount.toString(),
    streamedAmount: streamed.toString(),
    withdrawnAmount: stream.withdrawnAmount.toString(),
    withdrawableAmount: withdrawable.toString(),
    refundableAmount: refundable.toString(),
    formatted: {
      depositAmount: formatAmount(stream.depositAmount),
      streamedAmount: formatAmount(streamed),
      withdrawnAmount: formatAmount(stream.withdrawnAmount),
      withdrawableAmount: formatAmount(withdrawable),
      refundableAmount: formatAmount(refundable),
    },
    asOf: t,
  };
}

interface PendingMilestone {
  at: number;
  streamId: string;
  milestone: StreamMilestone;
}

/**
 * In-memory stream index + milestone scheduler. Emits `milestone` events
 * (`StreamMilestoneEvent`) when a stream reaches its cliff or completes.
 */
export class StreamCalculatorService extends EventEmitter {
  private streams = new Map<string, StreamRecord>();
  private byAddress = new Map<string, Set<string>>();
  /** Sorted ascending by `at`. */
  private pending: PendingMilestone[] = [];
  private notified = new Set<string>();
  private ticker: NodeJS.Timeout | null = null;

  upsertStream(stream: StreamRecord): StreamRecord {
    if (stream.endTime <= stream.startTime) {
      throw new Error('endTime must be after startTime');
    }
    if (stream.cliffTime < stream.startTime || stream.cliffTime > stream.endTime) {
      throw new Error('cliffTime must be between startTime and endTime');
    }
    if (stream.depositAmount <= 0n) {
      throw new Error('depositAmount must be positive');
    }

    this.streams.set(stream.streamId, stream);
    this.index(stream.sender, stream.streamId);
    this.index(stream.recipient, stream.streamId);
    this.scheduleMilestones(stream);
    return stream;
  }

  recordWithdrawal(streamId: string, amount: bigint): StreamRecord {
    const stream = this.require(streamId);
    if (amount <= 0n) {
      throw new Error('Withdrawal amount must be positive');
    }
    // Indexed withdrawals already succeeded on-chain, so they are applied as
    // reported even if local clock skew makes them exceed our view of
    // the withdrawable amount at `at`.
    stream.withdrawnAmount += amount;
    if (stream.withdrawnAmount > stream.depositAmount) {
      stream.withdrawnAmount = stream.depositAmount;
    }
    stream.updatedAt = Date.now();
    return stream;
  }

  recordCancellation(
    streamId: string,
    at: number,
    amounts: { senderAmount?: bigint; recipientAmount?: bigint } = {}
  ): StreamRecord {
    const stream = this.require(streamId);
    stream.canceledAt = at;
    if (amounts.senderAmount !== undefined) {
      stream.refundedAmount = amounts.senderAmount;
    } else if (amounts.recipientAmount !== undefined) {
      stream.refundedAmount =
        stream.depositAmount - stream.withdrawnAmount - amounts.recipientAmount;
    }
    stream.updatedAt = Date.now();
    // A canceled stream never reaches its remaining milestones.
    this.pending = this.pending.filter((p) => p.streamId !== streamId);
    return stream;
  }

  getStream(streamId: string): StreamRecord | undefined {
    return this.streams.get(streamId);
  }

  getBalance(streamId: string, t: number = nowInSeconds()): StreamBalance | undefined {
    const stream = this.streams.get(streamId);
    return stream ? computeBalance(stream, t) : undefined;
  }

  /** Bulk balance lookup at a single consistent timestamp. */
  getBalances(
    streamIds: string[],
    t: number = nowInSeconds()
  ): { balances: StreamBalance[]; missing: string[] } {
    const balances: StreamBalance[] = [];
    const missing: string[] = [];
    for (const id of streamIds) {
      const stream = this.streams.get(id);
      if (stream) {
        balances.push(computeBalance(stream, t));
      } else {
        missing.push(id);
      }
    }
    return { balances, missing };
  }

  listByAddress(address: string): StreamRecord[] {
    const ids = this.byAddress.get(address);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.streams.get(id))
      .filter((s): s is StreamRecord => Boolean(s));
  }

  get size(): number {
    return this.streams.size;
  }

  /** Fire every milestone whose time has passed. Returns the emitted events. */
  processDueMilestones(t: number = nowInSeconds()): StreamMilestoneEvent[] {
    const emitted: StreamMilestoneEvent[] = [];
    while (this.pending.length > 0 && (this.pending[0] as PendingMilestone).at <= t) {
      const next = this.pending.shift() as PendingMilestone;
      const key = `${next.streamId}:${next.milestone}`;
      const stream = this.streams.get(next.streamId);
      if (!stream || this.notified.has(key) || stream.canceledAt !== undefined) continue;

      this.notified.add(key);
      const event: StreamMilestoneEvent = {
        milestone: next.milestone,
        streamId: stream.streamId,
        sender: stream.sender,
        recipient: stream.recipient,
        at: next.at,
        balance: computeBalance(stream, Math.max(t, next.at)),
      };
      emitted.push(event);
      this.emit('milestone', event);
    }
    return emitted;
  }

  startMilestoneTicker(intervalMs = Number(process.env.STREAM_MILESTONE_TICK_MS || '1000')): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => this.processDueMilestones(), intervalMs);
    this.ticker.unref?.();
  }

  stopMilestoneTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  reset(): void {
    this.streams.clear();
    this.byAddress.clear();
    this.pending = [];
    this.notified.clear();
  }

  private require(streamId: string): StreamRecord {
    const stream = this.streams.get(streamId);
    if (!stream) throw new Error(`Unknown stream ${streamId}`);
    return stream;
  }

  private index(address: string, streamId: string): void {
    const ids = this.byAddress.get(address) ?? new Set<string>();
    ids.add(streamId);
    this.byAddress.set(address, ids);
  }

  private scheduleMilestones(stream: StreamRecord, t: number = nowInSeconds()): void {
    this.pending = this.pending.filter((p) => p.streamId !== stream.streamId);
    if (stream.canceledAt !== undefined) return;
    // Milestones that passed long before the stream was indexed (historical
    // backfill) are not re-announced; recent ones still fire.
    const graceSeconds = Number(process.env.STREAM_MILESTONE_GRACE_SECONDS || '300');
    const schedule = (at: number, milestone: StreamMilestone) => {
      if (at >= t - graceSeconds) {
        this.insertPending({ at, streamId: stream.streamId, milestone });
      }
    };
    // A cliff equal to the start time is not a meaningful milestone.
    if (stream.cliffTime > stream.startTime) {
      schedule(stream.cliffTime, 'cliff_reached');
    }
    schedule(stream.endTime, 'completed');
  }

  private insertPending(entry: PendingMilestone): void {
    // Binary search keeps insertion O(log n) for thousands of streams.
    let lo = 0;
    let hi = this.pending.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((this.pending[mid] as PendingMilestone).at <= entry.at) lo = mid + 1;
      else hi = mid;
    }
    this.pending.splice(lo, 0, entry);
  }
}

export const streamCalculatorService = new StreamCalculatorService();
