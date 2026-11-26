/**
 * Encoding helpers between snarkjs Groth16 output and the Soroban
 * `zk_proof_verifier` contract (see docs/contracts/SC-020-ZK-PROOF-VERIFIER.md).
 *
 * Contract expectations:
 * - G1 points: 64 bytes, `X || Y`, each coordinate 32-byte big-endian.
 * - G2 points: 128 bytes, `X || Y`, each Fp2 coordinate encoded `c1 || c0`.
 * - Public scalars: 32-byte big-endian canonical BN254 scalars, ordered
 *   `[course_hash, nullifier, ...public_inputs]`.
 *
 * snarkjs emits affine points as decimal strings with a trailing projective
 * `z` coordinate (`"1"` for G1, `["1", "0"]` for G2) and Fp2 elements as
 * `[c0, c1]`.
 */

/** BN254 base field modulus (coordinates of G1/G2 points). */
export const BN254_FIELD_MODULUS =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

/** BN254 scalar field modulus (public inputs). */
export const BN254_SCALAR_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface SnarkjsGroth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol?: string;
  curve?: string;
}

/** Hex-encoded (no `0x`) arguments for `verify_completion`. */
export interface SorobanGroth16Call {
  courseHash: string;
  nullifier: string;
  publicInputs: string[];
  proof: {
    a_g1: string;
    b_g2: string;
    c_g1: string;
  };
}

export class ZkEncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZkEncodingError';
  }
}

function parseDecimal(value: unknown, what: string): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new ZkEncodingError(`${what} must be a non-negative decimal string`);
  }
  return BigInt(value);
}

/** Encodes a non-negative integer below `modulus` as 32 big-endian bytes (hex). */
export function toBytes32Hex(value: bigint, modulus: bigint, what: string): string {
  if (value < 0n || value >= modulus) {
    throw new ZkEncodingError(`${what} is outside the BN254 field`);
  }
  return value.toString(16).padStart(64, '0');
}

function fieldElement(value: unknown, what: string): string {
  return toBytes32Hex(parseDecimal(value, what), BN254_FIELD_MODULUS, what);
}

export function encodeG1(point: string[], what = 'G1 point'): string {
  if (!Array.isArray(point) || point.length !== 3 || point[2] !== '1') {
    throw new ZkEncodingError(`${what} must be an affine [x, y, "1"] triple`);
  }
  return fieldElement(point[0], `${what}.x`) + fieldElement(point[1], `${what}.y`);
}

export function encodeG2(point: string[][], what = 'G2 point'): string {
  const isPair = (v: unknown): v is string[] => Array.isArray(v) && v.length === 2;
  if (
    !Array.isArray(point) ||
    point.length !== 3 ||
    !isPair(point[0]) ||
    !isPair(point[1]) ||
    !isPair(point[2]) ||
    point[2][0] !== '1' ||
    point[2][1] !== '0'
  ) {
    throw new ZkEncodingError(`${what} must be an affine [[x0,x1],[y0,y1],["1","0"]] triple`);
  }
  const [x, y] = point;
  // snarkjs stores Fp2 as [c0, c1]; Soroban expects c1 || c0.
  return (
    fieldElement(x[1], `${what}.x.c1`) +
    fieldElement(x[0], `${what}.x.c0`) +
    fieldElement(y[1], `${what}.y.c1`) +
    fieldElement(y[0], `${what}.y.c0`)
  );
}

export function encodeScalar(value: string, what = 'public signal'): string {
  return toBytes32Hex(parseDecimal(value, what), BN254_SCALAR_MODULUS, what);
}

/**
 * Converts a snarkjs Groth16 proof and its public signals into the argument
 * layout of `ZkProofVerifierContract::verify_completion`.
 */
export function toSorobanGroth16Call(
  proof: SnarkjsGroth16Proof,
  publicSignals: string[],
): SorobanGroth16Call {
  if (proof.protocol !== undefined && proof.protocol !== 'groth16') {
    throw new ZkEncodingError(`unsupported proof protocol: ${proof.protocol}`);
  }
  if (proof.curve !== undefined && proof.curve !== 'bn128' && proof.curve !== 'bn254') {
    throw new ZkEncodingError(`unsupported curve: ${proof.curve}`);
  }
  if (!Array.isArray(publicSignals) || publicSignals.length < 2) {
    throw new ZkEncodingError('public signals must start with course_hash and nullifier');
  }

  const [courseHash, nullifier, ...rest] = publicSignals.map((signal, index) =>
    encodeScalar(signal, `publicSignals[${index}]`),
  );

  return {
    courseHash,
    nullifier,
    publicInputs: rest,
    proof: {
      a_g1: encodeG1(proof.pi_a, 'pi_a'),
      b_g2: encodeG2(proof.pi_b, 'pi_b'),
      c_g1: encodeG1(proof.pi_c, 'pi_c'),
    },
  };
}
