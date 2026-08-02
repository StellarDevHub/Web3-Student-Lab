/// <reference types="node" />
import { createHash, randomUUID } from 'crypto';
import { certificateBlockchainService } from '../blockchain/CertificateBlockchainService.js';
import logger from '../utils/logger.js';

export interface ContractCompileRequest {
  sourceCode: string;
  compilerVersion: string;
  optimization: boolean;
  target: 'solidity' | 'evm' | 'soroban' | 'wasm';
  entryPoint?: string;
}

export interface ContractExecutionRequest {
  contractAddress: string;
  functionName: string;
  parameters?: Array<string | number | boolean | null>;
  gasLimit: number;
  caller?: string;
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
  const { sourceCode, compilerVersion, optimization, target, entryPoint } = request;
  const sourceHash = createSourceHash(sourceCode);
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

export async function executeSmartContract(
  request: ContractExecutionRequest
): Promise<ContractExecutionResult> {
  const { contractAddress, functionName, parameters = [], gasLimit, caller = 'anonymous' } = request;
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
