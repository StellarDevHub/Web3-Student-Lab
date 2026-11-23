# Soroban Groth16 verifier

This contract performs an on-chain Groth16 verification over BN254 using the
native Soroban `bn254` pairing and G1 multi-scalar multiplication host
operations. It does not accept an off-chain verification assertion or a hash
commitment in place of a proof.

## Circuit and proof format

The circuit must expose public scalars in this order:

1. `course_hash`
2. `nullifier`
3. Any additional public inputs

The proving witness, including the completion evidence and any secret used to
derive the nullifier, remains private. Both named values and all additional
public inputs are 32-byte big-endian canonical BN254 scalar encodings. A
course digest must therefore be mapped into the scalar field consistently by
the circuit and prover. The circuit must constrain its nullifier to the secret
witness (typically using a course-scoped secret hash); the contract then
registers that same nullifier after the pairing equation succeeds.

G1 and G2 points in `VerifyingKey` and `Groth16Proof` use the uncompressed
BN254 encodings expected by Soroban: 64-byte G1 points and 128-byte G2 points.
Each coordinate is big-endian; each G2 Fp2 coefficient is encoded as
`c1 || c0`. The verifying key's `gamma_abc_g1` has one constant point followed
by exactly one point for every public scalar.

The pairing equation checked is:

```text
e(A, B) * e(-alpha, beta) * e(-vk_x, gamma) * e(-C, delta) == 1
```

where `vk_x` is calculated from the verifying key's IC points and the ordered
public scalars. Course completion calls are permissionless and do not accept a
student address, preventing wallet identity from being recorded or included
in the proof interface.

## Replay protection and storage

A successful verification consumes its nullifier and emits an event containing
only the course hash and nullifier. Nullifiers are stored as persistent Soroban
entries with a six-million-ledger TTL extension. As with all expiring Soroban
storage, this is a bounded retention period; applications requiring replay
protection beyond that period must renew retained entries through a keeper or
restore policy.

The contract bounds additional public inputs to 32 to keep the MSM and storage
costs predictable. Invalid pairing equations, malformed G1 encodings, wrong
input counts, and noncanonical public scalars are rejected with typed contract
errors.
