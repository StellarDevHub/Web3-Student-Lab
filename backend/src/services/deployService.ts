import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

export interface DeployRequest {
  wasmPath: string;
  network?: string;
  sourceKey?: string;
  rpcUrl?: string;
}

export interface DeployResult {
  success: boolean;
  contractId?: string;
  network: string;
  durationMs: number;
  error?: string;
}

function resolveNetwork(provided?: string): string {
  return provided || process.env.SOROBAN_NETWORK || 'testnet';
}

function resolveRpcUrl(provided?: string): string | undefined {
  if (provided) return provided;
  const network = resolveNetwork();
  const envUrl = process.env.SOROBAN_RPC_URL;
  if (envUrl) return envUrl;
  const defaults: Record<string, string> = {
    local: 'http://localhost:8000/soroban/rpc',
    testnet: 'https://soroban-testnet.stellar.org',
    mainnet: 'https://soroban-mainnet.stellar.org',
  };
  return defaults[network];
}

export async function deployContract(request: DeployRequest): Promise<DeployResult> {
  const start = process.hrtime.bigint();
  const network = resolveNetwork(request.network);

  try {
    const wasmPath = path.resolve(request.wasmPath);
    if (!fs.existsSync(wasmPath)) {
      return {
        success: false,
        network,
        durationMs: 0,
        error: `WASM file not found: ${wasmPath}`,
      };
    }

    const sourceKey = request.sourceKey || process.env.SOROBAN_SOURCE_KEY;
    if (!sourceKey) {
      return {
        success: false,
        network,
        durationMs: 0,
        error: 'SOROBAN_SOURCE_KEY is required. Set it in environment or pass sourceKey.',
      };
    }

    const args = ['contract', 'deploy', '--wasm', wasmPath, '--source', sourceKey, '--network', network];

    const rpcUrl = resolveRpcUrl(request.rpcUrl);
    if (rpcUrl) {
      args.push('--rpc-url', rpcUrl);
    }

    logger.info('Invoking soroban contract deploy', { network, wasmPath });

    const { stdout, stderr } = await execFileAsync('soroban', args, {
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });

    const contractId = stdout?.toString().trim();
    if (!contractId) {
      throw new Error(`Empty response from soroban CLI.\nstderr: ${stderr}`);
    }

    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;

    logger.info('Contract deployed successfully', { contractId, network, durationMs });

    return {
      success: true,
      contractId,
      network,
      durationMs,
    };
  } catch (err: any) {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;

    const message = err.stderr?.toString().trim() || err.message || 'Unknown error';
    logger.error('Contract deployment failed', { error: message, network, durationMs });

    return {
      success: false,
      network,
      durationMs,
      error: message,
    };
  }
}
