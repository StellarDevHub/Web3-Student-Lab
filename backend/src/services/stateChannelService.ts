import { createHash } from 'node:crypto';
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { KmsStellarSigner, type KmsSignableTransaction } from '../blockchain/kmsSigner.js';
import { SOROBAN_RPC_URL } from '../config/rpcConfig.js';
import channelStore, { ChannelRecord, ChannelStatus, SequenceConflictError } from '../db/channelStore.js';
import logger from '../utils/logger.js';

/**
 * Off-chain state channel coordinator (#1589 / BE-017).
 *
 * Students and mentors co-sign exercise milestone transitions off-chain. Only
 * the initial funding and the final (cooperative or disputed) state touch the
 * Soroban ledger, via the channel contract's `fund_channel`, `settle_channel`
 * and `dispute_settle` entrypoints.
 */

const DISPUTE_WINDOW_MS = parseInt(process.env.STATE_CHANNEL_DISPUTE_WINDOW_MS || String(24 * 60 * 60 * 1000), 10);
const DISPUTE_SWEEP_INTERVAL_MS = parseInt(process.env.STATE_CHANNEL_DISPUTE_SWEEP_MS || '60000', 10);
const DEFAULT_CONTRACT_ID = process.env.STATE_CHANNEL_CONTRACT_ID || '';
const STATE_DOMAIN = 'web3-student-lab:state-channel:v1';

export interface ChannelState {
  channelId: string;
  sequence: number;
  completedMilestones: string[];
  studentRewardStroops: string;
  mentorRewardStroops: string;
  isFinal: boolean;
}

export interface SignedChannelState {
  state: ChannelState;
  /** base64 Ed25519 signature over `hashChannelState(state)` by the student key */
  studentSig: string;
  /** base64 Ed25519 signature over `hashChannelState(state)` by the mentor key */
  mentorSig: string;
}

export class ChannelError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);
    this.name = 'ChannelError';
  }
}

/**
 * Canonical state hash both parties sign. Keys are serialized in a fixed order
 * and milestones are sorted so every client produces identical bytes.
 */
export function hashChannelState(state: ChannelState): Buffer {
  const canonical = JSON.stringify([
    STATE_DOMAIN,
    state.channelId,
    state.sequence,
    [...state.completedMilestones].sort(),
    state.studentRewardStroops,
    state.mentorRewardStroops,
    state.isFinal,
  ]);
  return createHash('sha256').update(canonical).digest();
}

/** Message a party signs to open a dispute on the channel's latest state. */
export function hashDisputeRequest(channelId: string, sequence: number): Buffer {
  return createHash('sha256').update(`${STATE_DOMAIN}:dispute:${channelId}:${sequence}`).digest();
}

export function verifySignature(publicKey: string, payload: Buffer, signatureB64: string): boolean {
  try {
    const signature = Buffer.from(signatureB64, 'base64');
    if (signature.length !== 64) return false;
    return Keypair.fromPublicKey(publicKey).verify(payload, signature);
  } catch {
    return false;
  }
}

function parseStroops(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new ChannelError(`${field} must be a non-negative integer amount of stroops`);
  }
  return BigInt(value);
}

// ── On-chain settlement ────────────────────────────────────────────────────

export interface SettlementArgs {
  contractId: string;
  channelId: string;
  sequence: number;
  stateHash: Buffer;
  studentPublicKey: string;
  mentorPublicKey: string;
  studentRewardStroops: bigint;
  mentorRewardStroops: bigint;
  studentSig: Buffer;
  mentorSig: Buffer;
}

export interface ChannelSettlementClient {
  fundChannel(args: {
    contractId: string;
    channelId: string;
    studentPublicKey: string;
    mentorPublicKey: string;
    rewardStroops: bigint;
  }): Promise<string>;
  settle(args: SettlementArgs, mode: 'cooperative' | 'dispute'): Promise<string>;
}

/** Submits channel transactions to the Soroban channel contract. */
export class SorobanChannelSettlementClient implements ChannelSettlementClient {
  private signer?: KmsStellarSigner;
  private readonly server: rpc.Server;
  private readonly networkPassphrase: string;

  constructor(signer?: KmsStellarSigner) {
    this.signer = signer;
    this.server = new rpc.Server(SOROBAN_RPC_URL, { allowHttp: SOROBAN_RPC_URL.startsWith('http://') });
    const net = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();
    this.networkPassphrase = net === 'mainnet' || net === 'public' ? Networks.PUBLIC : Networks.TESTNET;
  }

  private getSigner(): KmsStellarSigner {
    // Lazily constructed so importing this module never requires KMS config.
    this.signer ??= new KmsStellarSigner();
    return this.signer;
  }

  async fundChannel(args: {
    contractId: string;
    channelId: string;
    studentPublicKey: string;
    mentorPublicKey: string;
    rewardStroops: bigint;
  }): Promise<string> {
    return this.invoke(args.contractId, 'fund_channel', [
      nativeToScVal(args.channelId, { type: 'string' }),
      new Address(args.studentPublicKey).toScVal(),
      new Address(args.mentorPublicKey).toScVal(),
      nativeToScVal(args.rewardStroops, { type: 'i128' }),
    ]);
  }

  async settle(args: SettlementArgs, mode: 'cooperative' | 'dispute'): Promise<string> {
    return this.invoke(args.contractId, mode === 'cooperative' ? 'settle_channel' : 'dispute_settle', [
      nativeToScVal(args.channelId, { type: 'string' }),
      nativeToScVal(args.sequence, { type: 'u64' }),
      xdr.ScVal.scvBytes(args.stateHash),
      nativeToScVal(args.studentRewardStroops, { type: 'i128' }),
      nativeToScVal(args.mentorRewardStroops, { type: 'i128' }),
      xdr.ScVal.scvBytes(args.studentSig),
      xdr.ScVal.scvBytes(args.mentorSig),
    ]);
  }

  private async invoke(contractId: string, method: string, args: xdr.ScVal[]): Promise<string> {
    const signer = this.getSigner();
    const account = await this.server.getAccount(signer.getPublicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(60)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    await signer.signTransaction(prepared as unknown as KmsSignableTransaction, `state-channel:${method}`);

    const sent = await this.server.sendTransaction(prepared);
    if (sent.status === 'ERROR') {
      throw new Error(`Soroban rejected ${method}: ${sent.errorResult?.result().switch().name ?? 'unknown'}`);
    }

    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await this.server.getTransaction(sent.hash);
      if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return sent.hash;
      if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Soroban ${method} transaction ${sent.hash} failed`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Timed out waiting for Soroban ${method} transaction ${sent.hash}`);
  }
}

// ── Coordinator ────────────────────────────────────────────────────────────

export class StateChannelService {
  private disputeTimer?: NodeJS.Timeout;

  constructor(
    private settlement: ChannelSettlementClient = new SorobanChannelSettlementClient(),
    private store = channelStore
  ) {}

  async openChannel(input: {
    courseId: string;
    studentPublicKey: string;
    mentorPublicKey: string;
    rewardStroops: string;
    contractId?: string;
  }): Promise<ChannelRecord> {
    const contractId = input.contractId || DEFAULT_CONTRACT_ID;
    if (!contractId || !StrKey.isValidContract(contractId)) {
      throw new ChannelError('A valid state channel contract id is required');
    }
    if (!StrKey.isValidEd25519PublicKey(input.studentPublicKey)) {
      throw new ChannelError('studentPublicKey is not a valid Stellar public key');
    }
    if (!StrKey.isValidEd25519PublicKey(input.mentorPublicKey)) {
      throw new ChannelError('mentorPublicKey is not a valid Stellar public key');
    }
    if (input.studentPublicKey === input.mentorPublicKey) {
      throw new ChannelError('Student and mentor must be different parties');
    }
    const reward = parseStroops(input.rewardStroops, 'rewardStroops');

    const channel = await this.store.create({ ...input, contractId, rewardStroops: reward.toString() });

    let fundingTxHash: string;
    try {
      fundingTxHash = await this.settlement.fundChannel({
        contractId,
        channelId: channel.id,
        studentPublicKey: channel.studentPublicKey,
        mentorPublicKey: channel.mentorPublicKey,
        rewardStroops: reward,
      });
    } catch (err) {
      logger.error(`State channel ${channel.id} funding failed: ${(err as Error).message}`);
      throw new ChannelError(`Channel created but on-chain funding failed: ${(err as Error).message}`, 502);
    }

    logger.info(`State channel ${channel.id} funded on-chain: ${fundingTxHash}`);
    return this.store.markFunded(channel.id, fundingTxHash);
  }

  async getChannel(channelId: string): Promise<ChannelRecord> {
    const channel = await this.store.get(channelId);
    if (!channel) throw new ChannelError('State channel not found', 404);
    return channel;
  }

  async getHistory(channelId: string) {
    await this.getChannel(channelId);
    return this.store.listUpdates(channelId);
  }

  /**
   * Validate a co-signed state transition: strictly monotonic sequence number,
   * valid student + mentor signatures, milestones only ever grow, and the
   * reward split never exceeds the funded amount.
   */
  validateSignedState(channel: ChannelRecord, signed: SignedChannelState): Buffer {
    const { state } = signed;
    if (state.channelId !== channel.id) {
      throw new ChannelError('State belongs to a different channel');
    }
    if (!Number.isSafeInteger(state.sequence) || state.sequence !== channel.latestSequence + 1) {
      throw new ChannelError(
        `Sequence must be exactly ${channel.latestSequence + 1} (got ${state.sequence})`,
        409
      );
    }

    const milestones = state.completedMilestones;
    if (!Array.isArray(milestones) || new Set(milestones).size !== milestones.length) {
      throw new ChannelError('completedMilestones must be a list of unique milestone ids');
    }
    const previous = (channel.latestState as ChannelState | null)?.completedMilestones ?? [];
    const missing = previous.filter((m) => !milestones.includes(m));
    if (missing.length > 0) {
      throw new ChannelError(`Completed milestones cannot be removed: ${missing.join(', ')}`);
    }

    const student = parseStroops(state.studentRewardStroops, 'studentRewardStroops');
    const mentor = parseStroops(state.mentorRewardStroops, 'mentorRewardStroops');
    if (student + mentor > BigInt(channel.rewardStroops)) {
      throw new ChannelError('Reward split exceeds the funded channel amount');
    }

    const hash = hashChannelState(state);
    if (!verifySignature(channel.studentPublicKey, hash, signed.studentSig)) {
      throw new ChannelError('Invalid student signature', 401);
    }
    if (!verifySignature(channel.mentorPublicKey, hash, signed.mentorSig)) {
      throw new ChannelError('Invalid mentor signature', 401);
    }
    return hash;
  }

  /**
   * Record a dual-signed milestone transition. Accepted while the channel is
   * open, and also while disputed so the counterparty can answer a dispute
   * with a newer state before the challenge window closes.
   */
  async submitUpdate(channelId: string, signed: SignedChannelState): Promise<ChannelRecord> {
    const channel = await this.getChannel(channelId);
    if (channel.status !== 'open' && channel.status !== 'disputed') {
      throw new ChannelError(`Channel is ${channel.status} and no longer accepts updates`, 409);
    }

    const hash = this.validateSignedState(channel, signed);
    try {
      await this.store.appendUpdate(channelId, {
        sequence: signed.state.sequence,
        stateHash: hash.toString('hex'),
        state: signed.state,
        studentSig: signed.studentSig,
        mentorSig: signed.mentorSig,
      });
    } catch (err) {
      if (err instanceof SequenceConflictError) throw new ChannelError(err.message, 409);
      throw err;
    }

    const updated = await this.getChannel(channelId);
    if (signed.state.isFinal) {
      return this.settleLatest(updated, 'cooperative', ['open', 'disputed']);
    }
    return updated;
  }

  /**
   * Either party opens a dispute over the latest co-signed state. If the
   * counterparty doesn't respond with a newer or final state before the
   * challenge deadline, the dispute watcher settles the latest state on-chain.
   */
  async initiateDispute(
    channelId: string,
    initiatorPublicKey: string,
    signature: string
  ): Promise<ChannelRecord> {
    const channel = await this.getChannel(channelId);
    if (initiatorPublicKey !== channel.studentPublicKey && initiatorPublicKey !== channel.mentorPublicKey) {
      throw new ChannelError('Only a channel participant can open a dispute', 403);
    }
    if (channel.status !== 'open') {
      throw new ChannelError(`Channel is ${channel.status}; disputes can only be opened on open channels`, 409);
    }
    if (channel.latestSequence < 1) {
      throw new ChannelError('No co-signed state exists to dispute yet', 409);
    }
    if (!verifySignature(initiatorPublicKey, hashDisputeRequest(channelId, channel.latestSequence), signature)) {
      throw new ChannelError('Invalid dispute signature', 401);
    }

    const deadline = new Date(Date.now() + DISPUTE_WINDOW_MS);
    if (!(await this.store.startDispute(channelId, initiatorPublicKey, deadline))) {
      throw new ChannelError('Channel state changed while opening the dispute; retry', 409);
    }
    logger.info(`State channel ${channelId} disputed by ${initiatorPublicKey}; deadline ${deadline.toISOString()}`);
    return this.getChannel(channelId);
  }

  private async settleLatest(
    channel: ChannelRecord,
    mode: 'cooperative' | 'dispute',
    from: ChannelStatus[]
  ): Promise<ChannelRecord> {
    const state = channel.latestState as ChannelState | null;
    if (!state || !channel.latestStudentSig || !channel.latestMentorSig) {
      throw new ChannelError('Channel has no co-signed state to settle', 409);
    }
    if (!(await this.store.claimForSettlement(channel.id, from))) {
      throw new ChannelError('Channel is already being settled', 409);
    }

    try {
      const txHash = await this.settlement.settle(
        {
          contractId: channel.contractId,
          channelId: channel.id,
          sequence: channel.latestSequence,
          stateHash: hashChannelState(state),
          studentPublicKey: channel.studentPublicKey,
          mentorPublicKey: channel.mentorPublicKey,
          studentRewardStroops: BigInt(state.studentRewardStroops),
          mentorRewardStroops: BigInt(state.mentorRewardStroops),
          studentSig: Buffer.from(channel.latestStudentSig, 'base64'),
          mentorSig: Buffer.from(channel.latestMentorSig, 'base64'),
        },
        mode
      );
      logger.info(`State channel ${channel.id} settled on-chain (${mode}) at sequence ${channel.latestSequence}: ${txHash}`);
      return this.store.markSettled(channel.id, txHash);
    } catch (err) {
      // Put the channel back so a retry (or the dispute watcher) can settle it.
      await this.store.releaseSettlement(channel.id, channel.status);
      logger.error(`State channel ${channel.id} ${mode} settlement failed: ${(err as Error).message}`);
      throw new ChannelError(`On-chain settlement failed: ${(err as Error).message}`, 502);
    }
  }

  /** Settle every dispute whose challenge window has expired. */
  async sweepExpiredDisputes(now = new Date()): Promise<number> {
    const expired = await this.store.findExpiredDisputes(now);
    let settled = 0;
    for (const channel of expired) {
      try {
        await this.settleLatest(channel, 'dispute', ['disputed']);
        settled++;
      } catch (err) {
        logger.warn(`Dispute settlement for channel ${channel.id} deferred: ${(err as Error).message}`);
      }
    }
    return settled;
  }

  startDisputeWatcher(intervalMs = DISPUTE_SWEEP_INTERVAL_MS): void {
    if (this.disputeTimer) return;
    this.disputeTimer = setInterval(() => {
      this.sweepExpiredDisputes().catch((err) =>
        logger.error(`State channel dispute sweep failed: ${(err as Error).message}`)
      );
    }, intervalMs);
    this.disputeTimer.unref?.();
  }

  stopDisputeWatcher(): void {
    if (this.disputeTimer) clearInterval(this.disputeTimer);
    this.disputeTimer = undefined;
  }
}

export const stateChannelService = new StateChannelService();
