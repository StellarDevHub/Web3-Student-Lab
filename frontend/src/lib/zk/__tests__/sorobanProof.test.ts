import { describe, expect, it } from 'vitest';
import {
  BN254_FIELD_MODULUS,
  BN254_SCALAR_MODULUS,
  encodeG1,
  encodeG2,
  encodeScalar,
  toSorobanGroth16Call,
  ZkEncodingError,
} from '../sorobanProof';

const word = (n: number | bigint) => BigInt(n).toString(16).padStart(64, '0');

const proof = {
  pi_a: ['1', '2', '1'],
  pi_b: [
    ['3', '4'],
    ['5', '6'],
    ['1', '0'],
  ],
  pi_c: ['7', '8', '1'],
  protocol: 'groth16',
  curve: 'bn128',
};

describe('encodeG1', () => {
  it('encodes X || Y as 32-byte big-endian words', () => {
    const hex = encodeG1(['1', '2', '1']);
    expect(hex).toHaveLength(128);
    expect(hex).toBe(word(1) + word(2));
  });

  it('rejects non-affine points and out-of-field coordinates', () => {
    expect(() => encodeG1(['1', '2', '3'])).toThrow(ZkEncodingError);
    expect(() => encodeG1(['1', '2'])).toThrow(ZkEncodingError);
    expect(() => encodeG1([BN254_FIELD_MODULUS.toString(), '2', '1'])).toThrow(/outside/);
    expect(() => encodeG1(['-1', '2', '1'])).toThrow(/decimal/);
    expect(() => encodeG1(['0x01', '2', '1'])).toThrow(/decimal/);
  });

  it('accepts the largest field element', () => {
    const max = (BN254_FIELD_MODULUS - 1n).toString();
    expect(encodeG1([max, '0', '1'])).toBe(word(BN254_FIELD_MODULUS - 1n) + word(0));
  });
});

describe('encodeG2', () => {
  it('swaps snarkjs [c0, c1] into the Soroban c1 || c0 order', () => {
    const hex = encodeG2(proof.pi_b);
    expect(hex).toHaveLength(256);
    expect(hex).toBe(word(4) + word(3) + word(6) + word(5));
  });

  it('rejects malformed G2 points', () => {
    expect(() => encodeG2([['3', '4'], ['5', '6'], ['1', '1']])).toThrow(ZkEncodingError);
    expect(() => encodeG2([['3'], ['5', '6'], ['1', '0']])).toThrow(ZkEncodingError);
  });
});

describe('encodeScalar', () => {
  it('rejects non-canonical scalars, which the contract would also reject', () => {
    expect(encodeScalar('5')).toBe(word(5));
    expect(encodeScalar((BN254_SCALAR_MODULUS - 1n).toString())).toBe(word(BN254_SCALAR_MODULUS - 1n));
    expect(() => encodeScalar(BN254_SCALAR_MODULUS.toString())).toThrow(/outside/);
  });
});

describe('toSorobanGroth16Call', () => {
  it('maps public signals to [course_hash, nullifier, ...public_inputs]', () => {
    const call = toSorobanGroth16Call(proof, ['11', '22', '33', '44']);
    expect(call).toEqual({
      courseHash: word(11),
      nullifier: word(22),
      publicInputs: [word(33), word(44)],
      proof: {
        a_g1: word(1) + word(2),
        b_g2: word(4) + word(3) + word(6) + word(5),
        c_g1: word(7) + word(8),
      },
    });
  });

  it('requires course_hash and nullifier', () => {
    expect(() => toSorobanGroth16Call(proof, ['11'])).toThrow(/course_hash and nullifier/);
  });

  it('rejects other protocols and curves', () => {
    expect(() => toSorobanGroth16Call({ ...proof, protocol: 'plonk' }, ['1', '2'])).toThrow(/protocol/);
    expect(() => toSorobanGroth16Call({ ...proof, curve: 'bls12381' }, ['1', '2'])).toThrow(/curve/);
  });
});
