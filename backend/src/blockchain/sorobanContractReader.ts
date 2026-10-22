/**
 * Read-only Soroban contract calls via transaction simulation.
 *
 * Simulation executes the contract against current ledger state without
 * submitting anything, so no funded source account or signature is needed.
 * Shared by the DID / Verifiable Credential revocation checks and the stream
 * indexer.
 */

import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  scValToNative,
  type xdr,
} from '@stellar/stellar-sdk';
import { SOROBAN_RPC_URL, STELLAR_NETWORK } from '../config/rpcConfig.js';

export function getNetworkPassphrase(network: string = STELLAR_NETWORK): string {
  const net = network.toLowerCase();
  if (net === 'mainnet' || net === 'public') return Networks.PUBLIC;
  if (net === 'futurenet') return Networks.FUTURENET;
  if (net === 'local' || net === 'standalone') return Networks.STANDALONE;
  return Networks.TESTNET;
}

let sharedServer: rpc.Server | null = null;

export function getSorobanServer(): rpc.Server {
  if (!sharedServer) {
    sharedServer = new rpc.Server(SOROBAN_RPC_URL, {
      allowHttp: SOROBAN_RPC_URL.startsWith('http://'),
    });
  }
  return sharedServer;
}

export class ContractReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractReadError';
  }
}

/**
 * Simulate `contractId.method(...args)` and return the decoded native result.
 * Throws `ContractReadError` when the simulation fails (e.g. the contract
 * panics because the requested record does not exist).
 */
export async function readContract<T = unknown>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
  server: rpc.Server = getSorobanServer()
): Promise<T> {
  // Simulation never checks the source account's signature or balance.
  const source = new Account(Keypair.random().publicKey(), '0');
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation)) {
    const reason = 'error' in simulation ? String(simulation.error) : 'simulation failed';
    throw new ContractReadError(`${method} on ${contractId} failed: ${reason}`);
  }

  const retval = simulation.result?.retval;
  return (retval ? scValToNative(retval) : undefined) as T;
}
