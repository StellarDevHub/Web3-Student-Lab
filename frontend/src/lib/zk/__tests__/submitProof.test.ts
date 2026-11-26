import { afterEach, describe, expect, it, vi } from 'vitest';
import * as sdk from '@stellar/stellar-sdk';
import { buildVerifyCompletionArgs, getZkVerifierContractId } from '../submitProof';

const word = (n: number) => n.toString(16).padStart(64, '0');

const call = {
  courseHash: word(11),
  nullifier: word(22),
  publicInputs: [word(33)],
  proof: {
    a_g1: word(1) + word(2),
    b_g2: word(4) + word(3) + word(6) + word(5),
    c_g1: word(7) + word(8),
  },
};

describe('buildVerifyCompletionArgs', () => {
  it('encodes (course_hash, nullifier, public_inputs, proof) in contract order', () => {
    const args = buildVerifyCompletionArgs(sdk, call);
    expect(args).toHaveLength(4);

    const [courseHash, nullifier, publicInputs, proof] = args.map((arg) => sdk.scValToNative(arg));
    expect(Buffer.from(courseHash).toString('hex')).toBe(call.courseHash);
    expect(Buffer.from(nullifier).toString('hex')).toBe(call.nullifier);
    expect(publicInputs.map((input: Uint8Array) => Buffer.from(input).toString('hex'))).toEqual(
      call.publicInputs,
    );
    expect(Buffer.from(proof.a_g1).toString('hex')).toBe(call.proof.a_g1);
    expect(Buffer.from(proof.b_g2).toString('hex')).toBe(call.proof.b_g2);
    expect(Buffer.from(proof.c_g1).toString('hex')).toBe(call.proof.c_g1);
  });

  it('encodes Groth16Proof as a symbol-keyed map sorted by field name', () => {
    const proof = buildVerifyCompletionArgs(sdk, call)[3];
    const keys = proof.map()!.map((entry) => entry.key().sym().toString());
    expect(keys).toEqual(['a_g1', 'b_g2', 'c_g1']);
  });
});

describe('getZkVerifierContractId', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns null when unset or malformed', () => {
    vi.stubEnv('NEXT_PUBLIC_ZK_VERIFIER_CONTRACT_ID', '');
    expect(getZkVerifierContractId()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_ZK_VERIFIER_CONTRACT_ID', 'not-a-contract');
    expect(getZkVerifierContractId()).toBeNull();
  });

  it('returns a valid contract id', () => {
    const id = `C${'A'.repeat(55)}`;
    vi.stubEnv('NEXT_PUBLIC_ZK_VERIFIER_CONTRACT_ID', id);
    expect(getZkVerifierContractId()).toBe(id);
  });
});
