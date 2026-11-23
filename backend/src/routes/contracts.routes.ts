import { Router } from 'express';
import { compileSmartContract, executeSmartContract } from '../services/contract.service.js';
import { cancellationRegistry } from '../services/cancellationRegistry.js';
import logger from '../utils/logger.js';
import { validateRequest } from '../utils/validation.js';
import {
  contractCompileSchema,
  contractExecutionSchema,
  contractCancelSchema,
} from './contracts.validation.schemas.js';

const router: ReturnType<typeof Router> = Router();

/** Shared header key for attaching cancellation IDs to requests. */
const CANCELLATION_ID_HEADER = 'x-cancellation-id';

/**
 * Smart Contract Compilation Endpoint
 * Clients may include an X-Cancellation-Id header with a UUID.  When present
 * the request is registered in the CancellationRegistry so it can be stopped
 * via POST /cancel before (or during) execution.
 */
router.post('/compile', validateRequest(contractCompileSchema), async (req, res) => {
  const cancellationId = (req.headers[CANCELLATION_ID_HEADER] as string | undefined)?.trim();

  if (cancellationId) {
    try {
      cancellationRegistry.register(cancellationId);
    } catch (err) {
      // ID already in use — reject so client can send a fresh one.
      res.status(409).json({
        status: 'error',
        message: 'A request with this cancellationId is already in progress. Use a new ID.',
      });
      return;
    }
  }

  try {
    if (cancellationId) {
      cancellationRegistry.markRunning(cancellationId);
    }

    // Bail immediately if the client cancelled before we started heavy work.
    if (cancellationId && cancellationRegistry.isCancelled(cancellationId)) {
      res.status(200).json({ status: 'cancelled', cancellationId });
      return;
    }

    const compileResult = await compileSmartContract(req.body);

    // Check again after the async compile step.
    if (cancellationId && cancellationRegistry.isCancelled(cancellationId)) {
      res.status(200).json({ status: 'cancelled', cancellationId });
      return;
    }

    if (cancellationId) {
      cancellationRegistry.markComplete(cancellationId);
    }

    if (!compileResult.compiled) {
      logger.warn('Contract compilation failed due to invalid source or compilation rules', {
        sourceHash: compileResult.sourceHash,
        errors: compileResult.errors,
      });
      return res.status(400).json({
        status: 'error',
        message: 'Contract compilation failed',
        details: compileResult.errors,
        warnings: compileResult.warnings,
        cancellationId: cancellationId ?? null,
      });
    }

    res.json({
      status: 'success',
      compiled: true,
      warnings: compileResult.warnings,
      bytecode: compileResult.bytecode,
      abi: compileResult.abi,
      sourceHash: compileResult.sourceHash,
      compilerVersion: compileResult.compilerVersion,
      optimization: compileResult.optimization,
      target: compileResult.target,
      durationMs: compileResult.durationMs,
      cancellationId: cancellationId ?? null,
    });
  } catch (error) {
    if (cancellationId) {
      cancellationRegistry.markComplete(cancellationId);
    }
    logger.error('Unexpected error during contract compilation', error);
    res.status(500).json({ status: 'error', message: 'Unable to compile contract' });
  }
});

/**
 * Smart Contract Execution Simulation Endpoint
 * Supports the same X-Cancellation-Id header as the compile endpoint.
 */
router.post('/execute', validateRequest(contractExecutionSchema), async (req, res) => {
  const cancellationId = (req.headers[CANCELLATION_ID_HEADER] as string | undefined)?.trim();

  if (cancellationId) {
    try {
      cancellationRegistry.register(cancellationId);
    } catch {
      res.status(409).json({
        status: 'error',
        message: 'A request with this cancellationId is already in progress. Use a new ID.',
      });
      return;
    }
  }

  try {
    if (cancellationId) {
      cancellationRegistry.markRunning(cancellationId);
    }

    if (cancellationId && cancellationRegistry.isCancelled(cancellationId)) {
      res.status(200).json({ status: 'cancelled', cancellationId });
      return;
    }

    const executionResult = await executeSmartContract(req.body);

    if (cancellationId && cancellationRegistry.isCancelled(cancellationId)) {
      res.status(200).json({ status: 'cancelled', cancellationId });
      return;
    }

    if (cancellationId) {
      cancellationRegistry.markComplete(cancellationId);
    }

    res.json({
      status: executionResult.success ? 'success' : 'error',
      executionId: executionResult.executionId,
      contractAddress: executionResult.contractAddress,
      functionName: executionResult.functionName,
      caller: executionResult.caller,
      gasUsed: executionResult.gasUsed,
      durationMs: executionResult.durationMs,
      logs: executionResult.logs,
      output: executionResult.output,
      cancellationId: cancellationId ?? null,
    });
  } catch (error) {
    if (cancellationId) {
      cancellationRegistry.markComplete(cancellationId);
    }
    logger.error('Unexpected error during smart contract execution', error);
    res.status(500).json({ status: 'error', message: 'Unable to execute smart contract' });
  }
});

/**
 * Cancellation Endpoint
 * POST /api/v1/contracts/cancel
 * Body: { cancellationId: string (UUID) }
 *
 * Returns 200 in all "expected" cases; 400 only for malformed input.
 * The response body's `status` field communicates the exact outcome.
 */
router.post('/cancel', validateRequest(contractCancelSchema), (req, res) => {
  const { cancellationId } = req.body as { cancellationId: string };

  const outcome = cancellationRegistry.cancel(cancellationId);

  logger.info('Contract operation cancellation requested', { cancellationId, outcome });

  res.json({
    status: outcome,
    cancellationId,
  });
});

export default router;
