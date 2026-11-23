/// <reference types="node" />
import { createHash, randomUUID } from 'crypto';
import { certificateBlockchainService } from '../blockchain/CertificateBlockchainService.js';
import { lockManager } from '../lib/lock/index.js';
import { runSandboxedWasm } from '../simulator/wasmSandboxEngine.js';
import logger from '../utils/logger.js';

export interface ContractCompileRequest {
  sourceCode: string;
  compilerVersion: string;
  optimization: boolean;
  target: 'solidity' | 'evm' | 'soroban' | 'wasm';
  entryPoint?: string;
  /** Optional project identifier used to serialize compilations per project. */
  projectId?: string;
}

export interface ContractExecutionRequest {
  contractAddress: string;
  functionName: string;
  parameters?: Array<string | number | boolean | null>;
  gasLimit: number;
  caller?: string;
  /**
   * When provided, execution is routed through the sandboxed WASM engine
   * (Issue #1420) instead of the deterministic-but-simulated gas estimate
   * below. `wasmBase64` is the raw WASM binary and `parameters` (must be
   * i32 numbers) are passed positionally to `functionName`.
   */
  wasmBase64?: string;
  /** Optional memory ceiling for sandboxed WASM execution, in MB (default/hard-capped at 128MB). */
  memoryLimitMb?: number;
}

export interface ContractCompileResult {
  compiled: boolean;
  warnings: string[];
  errors: string[];
  bytecode: string;
  abi: Record<string, unknown>[];
  sourceHash: string;
  compilerVersion: string;
  optimization: boolean;
  target: string;
  durationMs: number;
}

export interface ContractExecutionResult {
  success: boolean;
  executionId: string;
  gasUsed: number;
  durationMs: number;
  output: Record<string, unknown>;
  logs: string[];
  contractAddress: string;
  functionName: string;
  caller: string;
}

const MAX_COMPILE_SIZE = 12_000;
const MAX_GAS_LIMIT = 10_000_000;

function createSourceHash(sourceCode: string): string {
  return createHash('sha256').update(sourceCode).digest('hex');
}

function buildBytecodeHash(sourceHash: string): string {
  return `0x${sourceHash.slice(0, 64)}`;
}

function buildAbi(functionName: string): Record<string, unknown>[] {
  return [
    {
      type: 'function',
      name: functionName,
      inputs: [{ name: 'args', type: 'bytes[]' }],
      outputs: [{ name: 'result', type: 'bytes' }],
      stateMutability: 'nonpayable',
    },
  ];
}

async function measureExecution<T>(work: () => Promise<T> | T): Promise<{ result: T; durationMs: number }> {
  const start = process.hrtime.bigint();
  const result = await work();
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1_000_000;
  return { result, durationMs };
}

export async function compileSmartContract(
  request: ContractCompileRequest
): Promise<ContractCompileResult> {
  const { sourceCode, compilerVersion, optimization, target, entryPoint, projectId } = request;
  const sourceHash = createSourceHash(sourceCode);

  // Only one worker may hold the compile lock for a given project at any
  // instant (#1419). Without a project id we fall back to the source hash so
  // identical payloads are still de-duplicated.
  const compileLock = lockManager.compileLockKey(projectId ?? sourceHash);

  return lockManager.withLock(
    compileLock,
    { ttlMs: 30_000, retryCount: 50, retryDelayMs: 100, retryJitterMs: 25, autoExtend: true },
    async () => {
      const { result, durationMs } = await measureExecution(() => {
        const warnings: string[] = [];
        const errors: string[] = [];

        if (!sourceCode.trim().includes('contract') && !sourceCode.trim().includes('module')) {
          errors.push('Contract source must include a valid contract or module declaration.');
        }

        if (sourceCode.length > MAX_COMPILE_SIZE) {
          errors.push(`Source exceeds maximum allowed size of ${MAX_COMPILE_SIZE} characters.`);
        }

        if (optimization && sourceCode.includes('assembly')) {
          warnings.push('Assembly blocks may increase compilation complexity and gas usage.');
        }

        if (compilerVersion === '0.0.0') {
          errors.push('Compiler version must be a valid semantic version.');
        }

        return {
          warnings,
          errors,
          bytecode: buildBytecodeHash(sourceHash),
          abi: buildAbi(entryPoint || 'execute'),
          compiled: errors.length === 0,
        };
      });

      const compileResult: ContractCompileResult = {
        compiled: result.compiled,
        warnings: result.warnings,
        errors: result.errors,
        bytecode: result.bytecode,
        abi: result.abi,
        sourceHash,
        compilerVersion,
        optimization,
        target,
        durationMs,
      };

      logger.info('Smart contract compilation completed', {
        durationMs: compileResult.durationMs,
        sourceHash: compileResult.sourceHash,
        target,
        compilerVersion,
        optimization,
        compiled: compileResult.compiled,
        warningCount: compileResult.warnings.length,
        errorCount: compileResult.errors.length,
      });

      return compileResult;
    }
  );
}

export async function executeSmartContract(
  request: ContractExecutionRequest
): Promise<ContractExecutionResult> {
  const { contractAddress, functionName, parameters = [], gasLimit, caller = 'anonymous', wasmBase64 } = request;

  if (wasmBase64) {
    return executeSandboxedWasmContract(request);
  }

  const { result, durationMs } = await measureExecution(async () => {
    const logs: string[] = [];
    const gasUsed = Math.min(gasLimit, Math.max(1_000, Math.floor(Math.random() * gasLimit) || 1_000));
    const output = {
      status: 'success',
      returnValue: `Executed ${functionName} with ${parameters.length} parameter(s)`,
      details: {
        invokedBy: caller,
        gasLimit,
        parameterCount: parameters.length,
      },
    };

    logs.push(`Executed contract ${contractAddress} function ${functionName}`);
    logs.push(`Gas used: ${gasUsed}`);

    if (gasUsed > gasLimit) {
      logs.push('Gas estimate exceeded request limits.');
    }

    const blockchainStatus = await certificateBlockchainService.verifyOnChain(contractAddress);
    logs.push(`Blockchain verification status: ${blockchainStatus}`);

    return {
      success: true,
      executionId: randomUUID(),
      gasUsed,
      output,
      logs,
    };
  });

  const executionResult: ContractExecutionResult = {
    ...result,
    durationMs,
    contractAddress,
    functionName,
    caller,
  };

  logger.info('Smart contract execution result', {
    executionId: executionResult.executionId,
    contractAddress: executionResult.contractAddress,
    functionName: executionResult.functionName,
    caller: executionResult.caller,
    durationMs: executionResult.durationMs,
    gasUsed: executionResult.gasUsed,
    success: executionResult.success,
    logCount: executionResult.logs.length,
  });

  return executionResult;
}

/**
 * Executes `functionName` from a raw WASM binary inside the sandboxed
 * execution engine (Issue #1420) — deterministic gas metering, a hard
 * memory ceiling, and host-call sandboxing, run inside an isolated worker
 * thread so a hostile or buggy module can never hang or crash the backend
 * process.
 */
async function executeSandboxedWasmContract(
  request: ContractExecutionRequest
): Promise<ContractExecutionResult> {
  const { contractAddress, functionName, parameters = [], gasLimit, caller = 'anonymous', wasmBase64, memoryLimitMb } = request;

  const numericArgs = parameters.map((p) => (typeof p === 'number' ? p : Number(p) || 0));

  const sandboxResult = await runSandboxedWasm({
    wasmBase64: wasmBase64!,
    functionName,
    args: numericArgs,
    gasLimit,
    memoryLimitBytes: memoryLimitMb ? memoryLimitMb * 1024 * 1024 : undefined,
  });

  const logs: string[] = [
    `Sandboxed WASM execution of '${functionName}' on ${contractAddress}`,
    `Termination reason: ${sandboxResult.terminationReason}`,
    `Gas used: ${sandboxResult.gasUsed} / ${sandboxResult.gasLimit}`,
  ];
  if (sandboxResult.error) logs.push(`Error: ${sandboxResult.error}`);

  const executionResult: ContractExecutionResult = {
    success: sandboxResult.success,
    executionId: sandboxResult.executionId,
    gasUsed: sandboxResult.gasUsed,
    durationMs: sandboxResult.durationMs,
    output: {
      status: sandboxResult.success ? 'success' : 'error',
      returnValue: sandboxResult.returnValue,
      details: {
        terminationReason: sandboxResult.terminationReason,
        memoryUsedBytes: sandboxResult.memoryUsedBytes,
        memoryLimitBytes: sandboxResult.memoryLimitBytes,
        error: sandboxResult.error,
      },
    },
    logs,
    contractAddress,
    functionName,
    caller,
  };

  logger.info('Sandboxed WASM contract execution result', {
    executionId: executionResult.executionId,
    contractAddress,
    functionName,
    caller,
    durationMs: executionResult.durationMs,
    gasUsed: executionResult.gasUsed,
    terminationReason: sandboxResult.terminationReason,
    success: executionResult.success,
  });

  return executionResult;
}
