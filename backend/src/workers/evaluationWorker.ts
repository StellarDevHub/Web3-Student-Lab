/**
 * Contract Evaluation Worker — BE-010
 *
 * Consumes the `contract-evaluation` queue: each job carries a student's
 * compiled contract bytecode plus the exercise's test cases, which are run
 * inside the WASM execution sandbox (`services/wasmExecutionSandbox.ts`).
 * The structured result — per-test outcomes and exact gas consumption — is
 * stored as the job's return value and pushed live to the student via the
 * `exerciseStatusUpdated` GraphQL subscription (QUEUED → RUNNING →
 * PASSED | FAILED | ERROR).
 *
 * Hostile submissions never throw here: the sandbox reports them as results.
 * Only infrastructure faults reject, and those are retried by BullMQ and
 * eventually dead-lettered by the queue manager.
 */

import { UnrecoverableError, type Job, type Worker } from 'bullmq';
import { publishExerciseStatus, type ExerciseStatus, type ExerciseStatusEvent } from '../graphql/pubsub.js';
import { getQueueManager, QUEUE_NAMES, type QueueManager } from '../queues/queueManager.js';
import {
  MAX_TEST_CASES,
  runWasmEvaluation,
  type SandboxRunRequest,
  type SandboxRunResult,
  type WasmTestCase,
} from '../services/wasmExecutionSandbox.js';
import logger from '../utils/logger.js';

export interface EvaluationJobData {
  studentId: string;
  exerciseId: string;
  wasmBase64: string;
  tests: WasmTestCase[];
  userId?: string;
}

export type EvaluationJobResult = SandboxRunResult;

type Publish = (event: Omit<ExerciseStatusEvent, 'emittedAt'>) => void;
type Run = (request: SandboxRunRequest) => Promise<SandboxRunResult>;

const STATUS_BY_RESULT: Record<SandboxRunResult['status'], ExerciseStatus> = {
  passed: 'PASSED',
  failed: 'FAILED',
  error: 'ERROR',
};

function assertValidJob(data: EvaluationJobData): void {
  if (!data?.studentId || !data.exerciseId) {
    throw new UnrecoverableError('Evaluation job is missing studentId or exerciseId');
  }
  if (typeof data.wasmBase64 !== 'string' || data.wasmBase64.length === 0) {
    throw new UnrecoverableError('Evaluation job is missing wasmBase64');
  }
  if (!Array.isArray(data.tests) || data.tests.length === 0 || data.tests.length > MAX_TEST_CASES) {
    throw new UnrecoverableError(`Evaluation job must include 1-${MAX_TEST_CASES} test cases`);
  }
}

export function toStatusEvent(
  data: Pick<EvaluationJobData, 'studentId' | 'exerciseId'>,
  jobId: string | undefined,
  result: SandboxRunResult
): Omit<ExerciseStatusEvent, 'emittedAt'> {
  return {
    studentId: data.studentId,
    exerciseId: data.exerciseId,
    jobId: jobId ?? null,
    status: STATUS_BY_RESULT[result.status],
    gasUsed: result.gasUsed,
    gasLimit: result.gasLimit,
    terminationReason: result.terminationReason,
    passed: result.summary.passed,
    total: result.summary.total,
    tests: result.tests.map((t) => ({
      name: t.name,
      status: t.status,
      gasUsed: t.gasUsed,
      durationMs: t.durationMs,
      error: t.error ?? null,
    })),
    message: result.error ?? null,
  };
}

export function createEvaluationProcessor(run: Run = runWasmEvaluation, publish: Publish = publishExerciseStatus) {
  return async (job: Job<EvaluationJobData, EvaluationJobResult>): Promise<EvaluationJobResult> => {
    assertValidJob(job.data);
    const { studentId, exerciseId } = job.data;

    publish({ studentId, exerciseId, jobId: job.id ?? null, status: 'RUNNING' });

    try {
      const result = await run({ wasmBase64: job.data.wasmBase64, tests: job.data.tests });
      publish(toStatusEvent(job.data, job.id, result));
      logger.info('[evaluationWorker] Evaluation finished', {
        jobId: job.id,
        studentId,
        exerciseId,
        status: result.status,
        terminationReason: result.terminationReason,
        gasUsed: result.gasUsed,
      });
      return result;
    } catch (err) {
      publish({
        studentId,
        exerciseId,
        jobId: job.id ?? null,
        status: 'ERROR',
        message: 'Evaluation infrastructure error; the job will be retried.',
      });
      throw err;
    }
  };
}

export async function enqueueEvaluation(
  data: EvaluationJobData,
  manager: QueueManager = getQueueManager(),
  publish: Publish = publishExerciseStatus
): Promise<Job<EvaluationJobData>> {
  const job = await manager.enqueue(QUEUE_NAMES.CONTRACT_EVALUATION, 'evaluate-contract', data, {
    userId: data.studentId,
  });
  publish({ studentId: data.studentId, exerciseId: data.exerciseId, jobId: job.id ?? null, status: 'QUEUED' });
  return job;
}

let evaluationWorker: Worker<EvaluationJobData, EvaluationJobResult> | null = null;

export function startEvaluationWorker(manager: QueueManager = getQueueManager()) {
  if (!evaluationWorker) {
    evaluationWorker = manager.createWorker<EvaluationJobData, EvaluationJobResult>(
      QUEUE_NAMES.CONTRACT_EVALUATION,
      createEvaluationProcessor()
    );
  }
  return evaluationWorker;
}

export async function stopEvaluationWorker(): Promise<void> {
  if (!evaluationWorker) return;
  await evaluationWorker.close();
  evaluationWorker = null;
}
