import prisma from './index.js';

export type ChannelStatus = 'pending_funding' | 'open' | 'disputed' | 'settling' | 'settled';

export interface ChannelRecord {
  id: string;
  courseId: string;
  contractId: string;
  studentPublicKey: string;
  mentorPublicKey: string;
  rewardStroops: string;
  status: ChannelStatus;
  latestSequence: number;
  latestState: unknown;
  latestStudentSig: string | null;
  latestMentorSig: string | null;
  fundingTxHash: string | null;
  settlementTxHash: string | null;
  disputeInitiator: string | null;
  disputeDeadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SignedUpdateRecord {
  sequence: number;
  stateHash: string;
  state: unknown;
  studentSig: string;
  mentorSig: string;
}

export class SequenceConflictError extends Error {
  constructor(channelId: string, expected: number) {
    super(`State channel ${channelId} is no longer at sequence ${expected}`);
    this.name = 'SequenceConflictError';
  }
}

// Prisma's generated delegate types are not re-exported through the routed
// client in ../db/index.ts, so we narrow to the operations used here.
const db = prisma as any;

/**
 * Persistence for off-chain state channels (#1589). Every write that moves a
 * channel forward is a compare-and-set on `latestSequence` / `status` so two
 * concurrent requests can never both advance the same channel.
 */
export const channelStore = {
  async create(data: {
    courseId: string;
    contractId: string;
    studentPublicKey: string;
    mentorPublicKey: string;
    rewardStroops: string;
  }): Promise<ChannelRecord> {
    return db.stateChannel.create({ data: { ...data, status: 'pending_funding' } });
  },

  async get(id: string): Promise<ChannelRecord | null> {
    return db.stateChannel.findUnique({ where: { id } });
  },

  async listUpdates(channelId: string): Promise<SignedUpdateRecord[]> {
    return db.stateChannelUpdate.findMany({
      where: { channelId },
      orderBy: { sequence: 'asc' },
      select: { sequence: true, stateHash: true, state: true, studentSig: true, mentorSig: true },
    });
  },

  async markFunded(id: string, fundingTxHash: string): Promise<ChannelRecord> {
    return db.stateChannel.update({
      where: { id },
      data: { status: 'open', fundingTxHash },
    });
  },

  /**
   * Append a dual-signed update. Fails with SequenceConflictError unless the
   * channel is still at `update.sequence - 1` and in an updatable status.
   */
  async appendUpdate(id: string, update: SignedUpdateRecord): Promise<void> {
    await db.$transaction(async (tx: any) => {
      const result = await tx.stateChannel.updateMany({
        where: {
          id,
          latestSequence: update.sequence - 1,
          status: { in: ['open', 'disputed'] },
        },
        data: {
          latestSequence: update.sequence,
          latestState: update.state,
          latestStudentSig: update.studentSig,
          latestMentorSig: update.mentorSig,
        },
      });
      if (result.count !== 1) {
        throw new SequenceConflictError(id, update.sequence - 1);
      }
      await tx.stateChannelUpdate.create({ data: { channelId: id, ...update } });
    });
  },

  async startDispute(id: string, initiator: string, deadline: Date): Promise<boolean> {
    const result = await db.stateChannel.updateMany({
      where: { id, status: 'open' },
      data: { status: 'disputed', disputeInitiator: initiator, disputeDeadline: deadline },
    });
    return result.count === 1;
  },

  /** Atomically move a channel into `settling`; false if another worker won. */
  async claimForSettlement(id: string, from: ChannelStatus[]): Promise<boolean> {
    const result = await db.stateChannel.updateMany({
      where: { id, status: { in: from } },
      data: { status: 'settling' },
    });
    return result.count === 1;
  },

  async releaseSettlement(id: string, back: ChannelStatus): Promise<void> {
    await db.stateChannel.updateMany({ where: { id, status: 'settling' }, data: { status: back } });
  },

  async markSettled(id: string, settlementTxHash: string): Promise<ChannelRecord> {
    return db.stateChannel.update({
      where: { id },
      data: { status: 'settled', settlementTxHash },
    });
  },

  async findExpiredDisputes(now: Date, limit = 50): Promise<ChannelRecord[]> {
    return db.stateChannel.findMany({
      where: { status: 'disputed', disputeDeadline: { lte: now } },
      orderBy: { disputeDeadline: 'asc' },
      take: limit,
    });
  },
};

export default channelStore;
