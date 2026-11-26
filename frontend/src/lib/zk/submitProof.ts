/**
 * Submits a client-generated Groth16 proof to the Soroban `zk_proof_verifier`
 * contract (`verify_completion`). See docs/contracts/SC-020-ZK-PROOF-VERIFIER.md.
 */

import { Buffer } from 'buffer';
import { CONTRACT_ID_PATTERN, getPublicEnv } from '@/lib/env';
import type { SorobanGroth16Call } from './sorobanProof';

type StellarSdk = typeof import('@stellar/stellar-sdk');

/** Contract id of the deployed verifier, or null when the feature is not configured. */
export function getZkVerifierContractId(): string | null {
  const value = process.env.NEXT_PUBLIC_ZK_VERIFIER_CONTRACT_ID?.trim();
  return value && CONTRACT_ID_PATTERN.test(value) ? value : null;
}

function bytes(sdk: StellarSdk, hex: string) {
  return sdk.xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));
}

/**
 * Builds the ordered `verify_completion` arguments:
 * `(course_hash: BytesN<32>, nullifier: BytesN<32>, public_inputs: Vec<BytesN<32>>, proof: Groth16Proof)`.
 * `Groth16Proof` is a `#[contracttype]` struct, encoded as a map with symbol
 * keys in lexicographic order.
 */
export function buildVerifyCompletionArgs(sdk: StellarSdk, call: SorobanGroth16Call) {
  const { xdr } = sdk;
  const proof = xdr.ScVal.scvMap(
    (['a_g1', 'b_g2', 'c_g1'] as const).map(
      (key) =>
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol(key),
          val: bytes(sdk, call.proof[key]),
        }),
    ),
  );
  return [
    bytes(sdk, call.courseHash),
    bytes(sdk, call.nullifier),
    xdr.ScVal.scvVec(call.publicInputs.map((input) => bytes(sdk, input))),
    proof,
  ];
}

export interface SubmitProofOptions {
  call: SorobanGroth16Call;
  /** Account paying the fee. The proof itself carries no identity. */
  sourcePublicKey: string;
  networkPassphrase: string;
  signTransaction: (xdr: string, opts?: { networkPassphrase?: string }) => Promise<string>;
  contractId?: string;
  rpcUrl?: string;
  /** Confirmation polling. */
  pollIntervalMs?: number;
  maxPolls?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Simulates, signs, submits and confirms `verify_completion`. Returns the tx hash. */
export async function submitProofToVerifier({
  call,
  sourcePublicKey,
  networkPassphrase,
  signTransaction,
  contractId = getZkVerifierContractId() ?? undefined,
  rpcUrl = getPublicEnv().sorobanRpcUrl,
  pollIntervalMs = 1500,
  maxPolls = 20,
}: SubmitProofOptions): Promise<{ txHash: string }> {
  if (!contractId) {
    throw new Error('ZK verifier contract is not configured (NEXT_PUBLIC_ZK_VERIFIER_CONTRACT_ID).');
  }

  const sdk = await import('@stellar/stellar-sdk');
  const { rpc, Contract, TransactionBuilder, BASE_FEE } = sdk;
  const server = new rpc.Server(rpcUrl);

  const account = await server.getAccount(sourcePublicKey);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(new Contract(contractId).call('verify_completion', ...buildVerifyCompletionArgs(sdk, call)))
    .setTimeout(60)
    .build();

  // Simulation runs the pairing check, so an invalid proof fails here, before signing.
  const prepared = await server.prepareTransaction(tx);
  const signedXdr = await signTransaction(prepared.toXDR(), { networkPassphrase });
  const signed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

  const sent = await server.sendTransaction(signed);
  if (sent.status === 'ERROR') {
    throw new Error('The network rejected the proof transaction.');
  }

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const status = await server.getTransaction(sent.hash);
    if (status.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { txHash: sent.hash };
    }
    if (status.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error('Proof verification failed on-chain.');
    }
    await sleep(pollIntervalMs);
  }
  throw new Error('Timed out waiting for the proof transaction to confirm.');
}
