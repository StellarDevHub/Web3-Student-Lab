import { describe, expect, it, jest } from '@jest/globals';
import { UnrecoverableError } from 'bullmq';

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../src/blockchain/CertificateBlockchainService.js', () => {
  class BlockchainNotConfiguredError extends Error {
    constructor(operation: string) {
      super(`${operation} is not configured`);
      this.name = 'BlockchainNotConfiguredError';
    }
  }
  return { __esModule: true, BlockchainNotConfiguredError, CertificateBlockchainService: class {} };
});

import { BlockchainNotConfiguredError } from '../src/blockchain/CertificateBlockchainService.js';
import { createMintProcessor, RpcRateLimitedError, type MintJobData } from '../src/workers/mintingWorker.js';
import { createEvaluationProcessor, enqueueEvaluation, type EvaluationJobData } from '../src/workers/evaluationWorker.js';
import type { SandboxRunResult } from '../src/services/wasmExecutionSandbox.js';

const mintJob = (data: Partial<MintJobData> = {}) =>
  ({
    id: 'm1',
    attemptsMade: 0,
    data: { studentId: 's1', courseId: 'c1', metadata: { grade: 'A' }, ...data },
  }) as any;

describe('mintingWorker processor (BE-006)', () => {
  const okMinter = () => ({
    mintCertificate: jest.fn(async () => ({
      success: true,
      tokenId: 't1',
      transactionHash: 'abc',
      contractAddress: 'C1',
    })),
  });

  it('mints and returns the transaction details', async () => {
    const minter = okMinter();
    const result = await createMintProcessor(minter, () => undefined)(mintJob());
    expect(result).toMatchObject({ tokenId: 't1', transactionHash: 'abc', contractAddress: 'C1' });
    expect(minter.mintCertificate).toHaveBeenCalledWith({ grade: 'A', studentId: 's1', courseId: 'c1' });
  });

  it('treats an unconfirmed mint (circuit-breaker fallback) as a retryable failure', async () => {
    const minter = {
      mintCertificate: jest.fn(async () => ({
        success: false,
        tokenId: 'x',
        transactionHash: 'circuit-breaker-fallback',
        contractAddress: 'C1',
      })),
    };
    const err = await createMintProcessor(minter, () => undefined)(mintJob()).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UnrecoverableError);
  });

  it('sends invalid payloads straight to the DLQ via UnrecoverableError', async () => {
    const err = await createMintProcessor(okMinter(), () => undefined)(mintJob({ studentId: '' })).catch((e) => e);
    expect(err).toBeInstanceOf(UnrecoverableError);
  });

  it('does not burn retries on a misconfigured blockchain', async () => {
    const minter = {
      mintCertificate: jest.fn(async () => {
        throw new BlockchainNotConfiguredError('mintCertificate');
      }),
    };
    const err = await createMintProcessor(minter as any, () => undefined)(mintJob()).catch((e) => e);
    expect(err).toBeInstanceOf(UnrecoverableError);
  });

  it('pauses the whole queue on a Soroban 429 instead of consuming an attempt', async () => {
    const worker = { rateLimit: jest.fn(async () => undefined) };
    const minter = {
      mintCertificate: jest.fn(async () => {
        throw new RpcRateLimitedError(7_000);
      }),
    };
    const err = await createMintProcessor(minter as any, () => worker as any)(mintJob()).catch((e) => e);
    expect(worker.rateLimit).toHaveBeenCalledWith(7_000);
    expect(err.name).toBe('RateLimitError');
  });

  it('recognises HTTP 429 responses from the RPC client', async () => {
    const worker = { rateLimit: jest.fn(async () => undefined) };
    const minter = {
      mintCertificate: jest.fn(async () => {
        throw Object.assign(new Error('Too Many Requests'), { response: { status: 429 } });
      }),
    };
    await createMintProcessor(minter as any, () => worker as any)(mintJob()).catch(() => undefined);
    expect(worker.rateLimit).toHaveBeenCalled();
  });
});

const sandboxResult = (overrides: Partial<SandboxRunResult> = {}): SandboxRunResult => ({
  executionId: 'e1',
  status: 'passed',
  terminationReason: 'completed',
  gasUsed: 752,
  gasLimit: 1_000_000,
  memoryPeakBytes: 0,
  memoryLimitBytes: 50 * 1024 * 1024,
  durationMs: 3,
  tests: [{ name: 't', functionName: 'add', status: 'passed', actual: 5, expected: 5, gasUsed: 752, durationMs: 0.1 }],
  summary: { total: 1, passed: 1, failed: 0, errored: 0, skipped: 0 },
  ...overrides,
});

const evaluationJob = (data: Partial<EvaluationJobData> = {}) =>
  ({
    id: 'j1',
    data: {
      studentId: 's1',
      exerciseId: 'ex1',
      wasmBase64: 'AGFzbQEAAAA=',
      tests: [{ name: 't', functionName: 'add', args: [2, 3], expected: 5 }],
      ...data,
    },
  }) as any;

describe('evaluationWorker processor (BE-010)', () => {
  it('runs the sandbox and streams RUNNING then the final status with gas and test outputs', async () => {
    const publish = jest.fn();
    const run = jest.fn(async () => sandboxResult());
    const result = await createEvaluationProcessor(run, publish)(evaluationJob());

    expect(result.gasUsed).toBe(752);
    expect(publish).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: 'RUNNING', studentId: 's1' }));
    expect(publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'PASSED',
        exerciseId: 'ex1',
        jobId: 'j1',
        gasUsed: 752,
        gasLimit: 1_000_000,
        passed: 1,
        total: 1,
        tests: [expect.objectContaining({ name: 't', status: 'passed', gasUsed: 752 })],
      })
    );
  });

  it.each([
    ['failed', 'FAILED'],
    ['error', 'ERROR'],
  ] as const)('maps a %s sandbox result to %s', async (status, expected) => {
    const publish = jest.fn();
    await createEvaluationProcessor(async () => sandboxResult({ status }), publish)(evaluationJob());
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ status: expected }));
  });

  it('rejects malformed jobs as unrecoverable', async () => {
    const err = await createEvaluationProcessor(jest.fn() as any, jest.fn())(evaluationJob({ tests: [] })).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(UnrecoverableError);
  });

  it('reports infrastructure faults and rethrows so BullMQ retries', async () => {
    const publish = jest.fn();
    const run = jest.fn(async () => {
      throw new Error('worker pool unavailable');
    });
    await expect(createEvaluationProcessor(run, publish)(evaluationJob())).rejects.toThrow('worker pool unavailable');
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ERROR' }));
  });

  it('enqueues per student (for rate limiting) and publishes QUEUED', async () => {
    const publish = jest.fn();
    const manager = { enqueue: jest.fn(async () => ({ id: 'j9' })) };
    await enqueueEvaluation(evaluationJob().data, manager as any, publish);

    expect(manager.enqueue).toHaveBeenCalledWith('contract-evaluation', 'evaluate-contract', expect.any(Object), {
      userId: 's1',
    });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ status: 'QUEUED', jobId: 'j9' }));
  });
});
