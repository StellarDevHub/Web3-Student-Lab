/**
 * Stream indexing daemon (Issue BE-018).
 *
 * Polls Soroban RPC `getEvents` for the configured stream contracts and feeds
 * stream creation, withdrawal and cancellation events into the in-memory
 * stream calculator. Event layout follows Sablier's LockupLinear events,
 * adapted to Soroban topics:
 *
 *   topics: [Symbol("create"),   streamId]  value: { sender, recipient, token,
 *                                                   deposit, start_time,
 *                                                   cliff_time, end_time }
 *   topics: [Symbol("withdraw"), streamId]  value: { to, amount } | amount
 *   topics: [Symbol("cancel"),   streamId]  value: { sender_amount,
 *                                                   recipient_amount }
 *
 * Common aliases ("created", "withdrawn", "canceled", "cancelled") and
 * camelCase field names are accepted as well.
 */

import { scValToNative, type rpc } from '@stellar/stellar-sdk';
import { getSorobanServer } from '../blockchain/sorobanContractReader.js';
import {
  nowInSeconds,
  streamCalculatorService,
  type StreamCalculatorService,
} from '../services/streamCalculatorService.js';
import logger from '../utils/logger.js';

export type NormalizedStreamEvent =
  | {
      type: 'created';
      eventId: string;
      contractId?: string;
      streamId: string;
      sender: string;
      recipient: string;
      asset?: string;
      depositAmount: bigint;
      startTime: number;
      cliffTime: number;
      endTime: number;
      cancelable?: boolean;
      ledger?: number;
      timestamp: number;
    }
  | {
      type: 'withdrawn';
      eventId: string;
      streamId: string;
      amount: bigint;
      to?: string;
      ledger?: number;
      timestamp: number;
    }
  | {
      type: 'canceled';
      eventId: string;
      streamId: string;
      senderAmount?: bigint;
      recipientAmount?: bigint;
      ledger?: number;
      timestamp: number;
    };

const CREATE_TOPICS = new Set(['create', 'created', 'create_stream']);
const WITHDRAW_TOPICS = new Set(['withdraw', 'withdrawn', 'withdraw_from_stream']);
const CANCEL_TOPICS = new Set(['cancel', 'canceled', 'cancelled', 'cancel_stream']);

const toBigInt = (value: unknown): bigint | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  return undefined;
};

const toSeconds = (value: unknown): number | undefined => {
  const big = toBigInt(value);
  return big === undefined ? undefined : Number(big);
};

const field = (value: Record<string, unknown>, ...names: string[]): unknown => {
  for (const name of names) {
    if (value[name] !== undefined) return value[name];
  }
  return undefined;
};

const contractIdOf = (event: rpc.Api.EventResponse): string | undefined => {
  const raw = event.contractId as unknown;
  if (!raw) return undefined;
  if (typeof raw === 'string') return raw;
  const maybe = raw as { contractId?: () => string };
  return typeof maybe.contractId === 'function' ? maybe.contractId() : String(raw);
};

/** Decode a raw Soroban event into a stream event, or null when unrelated. */
export function decodeStreamEvent(event: rpc.Api.EventResponse): NormalizedStreamEvent | null {
  const topics = event.topic.map((t) => scValToNative(t) as unknown);
  const name = String(topics[0] ?? '').toLowerCase();
  if (topics[1] === undefined) return null;
  const streamId = String(topics[1]);
  const value = scValToNative(event.value) as unknown;
  const timestamp = Math.floor(Date.parse(event.ledgerClosedAt) / 1000) || nowInSeconds();
  const base = { eventId: event.id, streamId, ledger: event.ledger, timestamp };

  if (CREATE_TOPICS.has(name)) {
    if (!value || typeof value !== 'object') return null;
    const v = value as Record<string, unknown>;
    const depositAmount = toBigInt(field(v, 'deposit', 'deposit_amount', 'depositAmount', 'amount'));
    const startTime = toSeconds(field(v, 'start_time', 'startTime', 'start'));
    const endTime = toSeconds(field(v, 'end_time', 'endTime', 'end', 'stop_time'));
    const cliffTime = toSeconds(field(v, 'cliff_time', 'cliffTime', 'cliff')) ?? startTime;
    const sender = field(v, 'sender');
    const recipient = field(v, 'recipient');
    if (
      depositAmount === undefined ||
      startTime === undefined ||
      endTime === undefined ||
      cliffTime === undefined ||
      typeof sender !== 'string' ||
      typeof recipient !== 'string'
    ) {
      logger.warn(`Skipping malformed stream create event ${event.id}`);
      return null;
    }
    const asset = field(v, 'token', 'asset');
    const cancelable = field(v, 'cancelable');
    const contractId = contractIdOf(event);
    return {
      ...base,
      type: 'created',
      sender,
      recipient,
      depositAmount,
      startTime,
      cliffTime,
      endTime,
      ...(typeof asset === 'string' ? { asset } : {}),
      ...(typeof cancelable === 'boolean' ? { cancelable } : {}),
      ...(contractId ? { contractId } : {}),
    };
  }

  if (WITHDRAW_TOPICS.has(name)) {
    const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
    const amount = toBigInt(v ? field(v, 'amount') : value);
    if (amount === undefined) return null;
    const to = v ? field(v, 'to', 'recipient') : undefined;
    return { ...base, type: 'withdrawn', amount, ...(typeof to === 'string' ? { to } : {}) };
  }

  if (CANCEL_TOPICS.has(name)) {
    const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const senderAmount = toBigInt(field(v, 'sender_amount', 'senderAmount', 'refund'));
    const recipientAmount = toBigInt(field(v, 'recipient_amount', 'recipientAmount'));
    return {
      ...base,
      type: 'canceled',
      ...(senderAmount !== undefined ? { senderAmount } : {}),
      ...(recipientAmount !== undefined ? { recipientAmount } : {}),
    };
  }

  return null;
}

export class StreamEventSubscriber {
  private cursor: string | undefined;
  private startLedger: number | undefined;
  private processed = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly options: {
      contractIds?: string[];
      pollIntervalMs?: number;
      calculator?: StreamCalculatorService;
      server?: rpc.Server;
    } = {}
  ) {
    const configuredStart = Number(process.env.STREAM_INDEXER_START_LEDGER);
    this.startLedger = Number.isFinite(configuredStart) && configuredStart > 0 ? configuredStart : undefined;
  }

  private get contractIds(): string[] {
    return (
      this.options.contractIds ??
      (process.env.STREAM_CONTRACT_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    );
  }

  private get calculator(): StreamCalculatorService {
    return this.options.calculator ?? streamCalculatorService;
  }

  /**
   * Apply one normalized event. Idempotent per `eventId`, so overlapping
   * polls or replays never double-count a withdrawal.
   */
  apply(event: NormalizedStreamEvent): boolean {
    if (this.processed.has(event.eventId)) return false;

    try {
      switch (event.type) {
        case 'created':
          this.calculator.upsertStream({
            streamId: event.streamId,
            sender: event.sender,
            recipient: event.recipient,
            depositAmount: event.depositAmount,
            startTime: event.startTime,
            cliffTime: event.cliffTime,
            endTime: event.endTime,
            withdrawnAmount: 0n,
            updatedAt: Date.now(),
            ...(event.contractId ? { contractId: event.contractId } : {}),
            ...(event.asset ? { asset: event.asset } : {}),
            ...(event.cancelable !== undefined ? { cancelable: event.cancelable } : {}),
            ...(event.ledger !== undefined ? { createdLedger: event.ledger } : {}),
          });
          break;
        case 'withdrawn':
          this.calculator.recordWithdrawal(event.streamId, event.amount);
          break;
        case 'canceled':
          this.calculator.recordCancellation(event.streamId, event.timestamp, {
            ...(event.senderAmount !== undefined ? { senderAmount: event.senderAmount } : {}),
            ...(event.recipientAmount !== undefined ? { recipientAmount: event.recipientAmount } : {}),
          });
          break;
      }
    } catch (error) {
      logger.warn(`Failed to apply stream event ${event.eventId}: ${(error as Error).message}`);
      return false;
    }

    this.processed.add(event.eventId);
    if (this.processed.size > 100_000) {
      // Event ids are monotonically increasing; drop the oldest half.
      const keep = Array.from(this.processed).slice(-50_000);
      this.processed = new Set(keep);
    }
    return true;
  }

  /** Fetch and apply one page of events. Returns the number applied. */
  async pollOnce(): Promise<number> {
    const contractIds = this.contractIds;
    if (contractIds.length === 0 || this.polling) return 0;
    this.polling = true;

    try {
      const server = this.options.server ?? getSorobanServer();
      if (!this.cursor && this.startLedger === undefined) {
        // Default to a recent window (~1h of ledgers) on first start.
        const latest = await server.getLatestLedger();
        this.startLedger = Math.max(1, latest.sequence - 720);
      }

      const filters = [{ type: 'contract' as const, contractIds }];
      const request = this.cursor
        ? { cursor: this.cursor, filters, limit: 200 }
        : { startLedger: this.startLedger as number, filters, limit: 200 };
      const response = await server.getEvents(request as Parameters<rpc.Server['getEvents']>[0]);

      let applied = 0;
      for (const raw of response.events) {
        const event = decodeStreamEvent(raw);
        if (event && this.apply(event)) applied += 1;
      }

      const last = response.events[response.events.length - 1];
      const nextCursor = (response as { cursor?: string }).cursor ?? last?.id;
      if (nextCursor) this.cursor = nextCursor;
      return applied;
    } catch (error) {
      logger.warn(`Stream indexer poll failed: ${(error as Error).message}`);
      return 0;
    } finally {
      this.polling = false;
    }
  }

  start(): void {
    if (this.timer || this.contractIds.length === 0) {
      if (this.contractIds.length === 0) {
        logger.info('Stream indexer disabled: STREAM_CONTRACT_IDS is not configured');
      }
      return;
    }
    const interval = this.options.pollIntervalMs ?? Number(process.env.STREAM_INDEXER_POLL_MS || '5000');
    void this.pollOnce();
    this.timer = setInterval(() => void this.pollOnce(), interval);
    this.timer.unref?.();
    logger.info(`Stream indexer watching ${this.contractIds.length} contract(s)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const streamEventSubscriber = new StreamEventSubscriber();
