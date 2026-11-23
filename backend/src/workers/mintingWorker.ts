/**
 * Certificate Minting Worker — BE-006
 *
 * Consumes the critical `tx-minting` queue and submits certificate mints to
 * Soroban. Throughput is bounded twice over so the cluster never exceeds the
 * RPC provider's submission limits:
 *
 *  - the queue's Redis-backed `limiter` (SOROBAN_RPC_MAX_SUBMISSIONS_PER_SEC),
 *    shared by every minting worker process;
 *  - when the RPC still answers 429, the worker pauses the *whole queue* for
 *    the advertised back-off via `worker.rateLimit()` and re-queues the job
 *    without consuming one of its retry attempts.
 *
 * Other transient failures are retried with exponential jitter by BullMQ;
 * configuration/validation problems are raised as `UnrecoverableError` so
 * they go straight to the dead-letter queue instead of burning retries.
 */

import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { BlockchainNotConfiguredError, CertificateBlockchainService } from '../blockchain/CertificateBlockchainService.js';
import { getQueueManager, QUEUE_NAMES, type QueueManager } from '../queues/queueManager.js';
import logger from '../utils/logger.js';

export interface MintJobData {
  studentId: string;
  courseId: string;
  /** Certificate metadata passed through to the contract. */
  metadata: Record<string, unknown>;
  certificateId?: string;
  userId?: string;
}

export interface MintJobResult {
  tokenId: string;
  transactionHash: string;
  contractAddress: string;
  mintedAt: string;
}

export interface Minter {
  mintCertificate(metadata: Record<string, unknown>): Promise<{
    success: boolean;
    tokenId: string;
    transactionHash: string;
    contractAddress: string;
  }>;
}

/** Default pause applied to the queue when Soroban RPC rate-limits us without a Retry-After. */
export const RPC_RATE_LIMIT_BACKOFF_MS = 5_000;

export class RpcRateLimitedError extends Error {
  constructor(readonly retryAfterMs = RPC_RATE_LIMIT_BACKOFF_MS) {
    super(`Soroban RPC rate limit hit; backing off ${retryAfterMs}ms`);
    this.name = 'RpcRateLimitedError';
  }
}

function isRateLimitResponse(err: unknown): err is { retryAfterMs?: number } {
  if (err instanceof RpcRateLimitedError) return true;
  const e = err as { status?: number; statusCode?: number; response?: { status?: number }; message?: string };
  const status = e?.status ?? e?.statusCode ?? e?.response?.status;
  return status === 429 || /\b429\b|rate.?limit/i.test(e?.message ?? '');
}

function validate(data: MintJobData): void {
  if (!data || typeof data.studentId !== 'string' || !data.studentId) {
    throw new UnrecoverableError('Mint job is missing studentId');
  }
  if (typeof data.courseId !== 'string' || !data.courseId) {
    throw new UnrecoverableError('Mint job is missing courseId');
  }
  if (!data.metadata || typeof data.metadata !== 'object') {
    throw new UnrecoverableError('Mint job is missing certificate metadata');
  }
}

/**
 * Builds the processor. `getWorker` is resolved lazily because the processor
 * must exist before the Worker that runs it does.
 */
export function createMintProcessor(minter: Minter, getWorker: () => Pick<Worker, 'rateLimit'> | undefined) {
  return async (job: Job<MintJobData, MintJobResult>): Promise<MintJobResult> => {
    validate(job.data);

    try {
      const result = await minter.mintCertificate({
        ...job.data.metadata,
        studentId: job.data.studentId,
        courseId: job.data.courseId,
      });

      // The blockchain service reports circuit-breaker fallbacks as
      // `success: false` instead of throwing; treat that as retryable.
      if (!result.success) {
        throw new Error(`Mint was not confirmed (tx: ${result.transactionHash})`);
      }

      logger.info('[mintingWorker] Certificate minted', {
        jobId: job.id,
        studentId: job.data.studentId,
        courseId: job.data.courseId,
        tokenId: result.tokenId,
        attempt: job.attemptsMade + 1,
      });

      return {
        tokenId: result.tokenId,
        transactionHash: result.transactionHash,
        contractAddress: result.contractAddress,
        mintedAt: new Date().toISOString(),
      };
    } catch (err) {
      if (err instanceof BlockchainNotConfiguredError) {
        throw new UnrecoverableError(err.message);
      }
      if (isRateLimitResponse(err)) {
        const worker = getWorker();
        if (worker) {
          const delay = (err as { retryAfterMs?: number }).retryAfterMs ?? RPC_RATE_LIMIT_BACKOFF_MS;
          logger.warn('[mintingWorker] Soroban RPC rate limited; pausing queue', { jobId: job.id, delay });
          await worker.rateLimit(delay);
          throw Worker.RateLimitError();
        }
      }
      throw err;
    }
  };
}

let mintingWorker: Worker<MintJobData, MintJobResult> | null = null;

export function startMintingWorker(
  manager: QueueManager = getQueueManager(),
  minter: Minter = new CertificateBlockchainService()
): Worker<MintJobData, MintJobResult> {
  if (mintingWorker) return mintingWorker;
  const processor = createMintProcessor(minter, () => mintingWorker ?? undefined);
  mintingWorker = manager.createWorker<MintJobData, MintJobResult>(QUEUE_NAMES.TX_MINTING, processor);
  return mintingWorker;
}

export async function stopMintingWorker(): Promise<void> {
  if (!mintingWorker) return;
  await mintingWorker.close();
  mintingWorker = null;
}

/** Convenience producer used by certificate issuance flows. */
export function enqueueMint(data: MintJobData, manager: QueueManager = getQueueManager()) {
  const jobId = data.certificateId ? `mint-${data.certificateId}` : undefined;
  return manager.enqueue(QUEUE_NAMES.TX_MINTING, 'mint-certificate', data, {
    ...(data.userId ? { userId: data.userId } : {}),
    ...(jobId ? { jobId } : {}),
  });
}
