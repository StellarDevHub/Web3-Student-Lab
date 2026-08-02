import { Router } from 'express';
import { compileSmartContract, executeSmartContract } from '../services/contract.service.js';
import logger from '../utils/logger.js';
import { validateRequest } from '../utils/validation.js';
import { contractCompileSchema, contractExecutionSchema } from './contracts.validation.schemas.js';

const router = Router();

/**
 * Smart Contract Compilation Endpoint
 * This route validates compilation requests, rejects malformed inputs,
 * monitors compile duration, and returns a deterministic compile summary.
 */
router.post('/compile', validateRequest(contractCompileSchema), async (req, res) => {
  try {
    const compileResult = await compileSmartContract(req.body);

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
    });
  } catch (error) {
    logger.error('Unexpected error during contract compilation', error);
    res.status(500).json({ status: 'error', message: 'Unable to compile contract' });
  }
});

/**
 * Smart Contract Execution Simulation Endpoint
 * Logs execution details, performance metrics, and returns a safe execution response.
 */
router.post('/execute', validateRequest(contractExecutionSchema), async (req, res) => {
  try {
    const executionResult = await executeSmartContract(req.body);

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
    });
  } catch (error) {
    logger.error('Unexpected error during smart contract execution', error);
    res.status(500).json({ status: 'error', message: 'Unable to execute smart contract' });
  }
});

export default router;
