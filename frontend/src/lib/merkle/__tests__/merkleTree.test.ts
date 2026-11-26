import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  buildAirdropTree,
  buildClaimOperation,
  computeLeaf,
  formatClaimSubmission,
  getPathNodeIds,
  getProof,
  getSiblingNodeIds,
  hashPair,
  i128ToBytesBE,
  bytesToHex,
  orderPair,
  parseClaimLines,
  u32ToBytesBE,
  verifyClaim,
  type AirdropClaim,
} from '../merkleTree';

/**
 * Golden vectors produced by the contract's own code.
 *
 * `compute_leaf` and `verify_proof` from
 * `contracts/smart_vault/src/merkle_distributor.rs` were copied verbatim into a
 * scratch crate (soroban-sdk 22.0.11; the contract pins 28, which needs a newer
 * rustc than was available) and run over these claims. The scratch run also
 * confirmed the contract's `verify_proof` accepts every proof below. If the
 * contract's leaf or pair scheme ever changes, these are the values to
 * regenerate — a mismatch here means the frontend no longer produces proofs the
 * contract accepts.
 */
const ADDRESSES = [
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
  'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
  'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ',
];
const AMOUNTS = [
  BigInt(500),
  BigInt(750),
  BigInt('1000000000000'),
  BigInt(1),
  BigInt('170141183460469231731687303715884105727'), // i128::MAX
];
const LEAVES = [
  'f57fb89695a6b69a4e375f9ee1a4d1300f6425004edc7c2503ca8d9f16dc7e82',
  'ebe6cdae9f4ea4f582de4729f40e94a0d43d4db61c7ce98646769e027cf4820d',
  'd8641ca59a1792e65e5810f3d4abdd950815d4fcbf1795f09033c46d287a9248',
  '4f5c633bb7cf176b9a748d442eeedb263d1e80abdc22b5f744c7d6b15952a3e4',
  '8ff83df8fe8616ebe7a4ff93200879d6872f9b94da7f16e08d6f7564ae20875f',
];
const ROOTS: Record<number, string> = {
  2: '4959e4192fe552df8b8f7809aca2e3f3fade621ef66539c26d64a4937b15710d',
  3: '1690ff9263335dfd95f744e8c76e5c4f8c0f7e22e5592693b8f04409fde767cb',
  4: 'b7fc5adb3e646d99ba195578dfb002e94b8698a089b7ce706e2e75a69b311de3',
  5: 'd1e79a41c19c9167cc27f63b44f636aea7c4bfc68451df821c4d166475d481d3',
};
/** `PROOFS[treeSize][leafIndex]` */
const PROOFS: Record<number, string[][]> = {
  2: [
    ['ebe6cdae9f4ea4f582de4729f40e94a0d43d4db61c7ce98646769e027cf4820d'],
    ['f57fb89695a6b69a4e375f9ee1a4d1300f6425004edc7c2503ca8d9f16dc7e82'],
  ],
  3: [
    [
      'ebe6cdae9f4ea4f582de4729f40e94a0d43d4db61c7ce98646769e027cf4820d',
      'd8641ca59a1792e65e5810f3d4abdd950815d4fcbf1795f09033c46d287a9248',
    ],
    [
      'f57fb89695a6b69a4e375f9ee1a4d1300f6425004edc7c2503ca8d9f16dc7e82',
      'd8641ca59a1792e65e5810f3d4abdd950815d4fcbf1795f09033c46d287a9248',
    ],
    ['4959e4192fe552df8b8f7809aca2e3f3fade621ef66539c26d64a4937b15710d'],
  ],
  4: [
    [
      'ebe6cdae9f4ea4f582de4729f40e94a0d43d4db61c7ce98646769e027cf4820d',
      '6cee410956b75b6572d1725f36c1be3abdd1b586b32d71a1d86b4381888f1e6f',
    ],
    [
      'f57fb89695a6b69a4e375f9ee1a4d1300f6425004edc7c2503ca8d9f16dc7e82',
      '6cee410956b75b6572d1725f36c1be3abdd1b586b32d71a1d86b4381888f1e6f',
    ],
    [
      '4f5c633bb7cf176b9a748d442eeedb263d1e80abdc22b5f744c7d6b15952a3e4',
      '4959e4192fe552df8b8f7809aca2e3f3fade621ef66539c26d64a4937b15710d',
    ],
    [
      'd8641ca59a1792e65e5810f3d4abdd950815d4fcbf1795f09033c46d287a9248',
      '4959e4192fe552df8b8f7809aca2e3f3fade621ef66539c26d64a4937b15710d',
    ],
  ],
  5: [
    [
      'ebe6cdae9f4ea4f582de4729f40e94a0d43d4db61c7ce98646769e027cf4820d',
      '6cee410956b75b6572d1725f36c1be3abdd1b586b32d71a1d86b4381888f1e6f',
      '8ff83df8fe8616ebe7a4ff93200879d6872f9b94da7f16e08d6f7564ae20875f',
    ],
    [
      'f57fb89695a6b69a4e375f9ee1a4d1300f6425004edc7c2503ca8d9f16dc7e82',
      '6cee410956b75b6572d1725f36c1be3abdd1b586b32d71a1d86b4381888f1e6f',
      '8ff83df8fe8616ebe7a4ff93200879d6872f9b94da7f16e08d6f7564ae20875f',
    ],
    [
      '4f5c633bb7cf176b9a748d442eeedb263d1e80abdc22b5f744c7d6b15952a3e4',
      '4959e4192fe552df8b8f7809aca2e3f3fade621ef66539c26d64a4937b15710d',
      '8ff83df8fe8616ebe7a4ff93200879d6872f9b94da7f16e08d6f7564ae20875f',
    ],
    [
      'd8641ca59a1792e65e5810f3d4abdd950815d4fcbf1795f09033c46d287a9248',
      '4959e4192fe552df8b8f7809aca2e3f3fade621ef66539c26d64a4937b15710d',
      '8ff83df8fe8616ebe7a4ff93200879d6872f9b94da7f16e08d6f7564ae20875f',
    ],
    ['b7fc5adb3e646d99ba195578dfb002e94b8698a089b7ce706e2e75a69b311de3'],
  ],
};

function claims(n: number): AirdropClaim[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    account: ADDRESSES[i],
    amount: AMOUNTS[i],
  }));
}

describe('byte encoding matches Rust', () => {
  it('encodes u32 as 4 big-endian bytes', () => {
    expect(bytesToHex(u32ToBytesBE(0))).toBe('00000000');
    expect(bytesToHex(u32ToBytesBE(1))).toBe('00000001');
    expect(bytesToHex(u32ToBytesBE(0xdeadbeef))).toBe('deadbeef');
    expect(() => u32ToBytesBE(-1)).toThrow();
    expect(() => u32ToBytesBE(0x100000000)).toThrow();
    expect(() => u32ToBytesBE(1.5)).toThrow();
  });

  it('encodes i128 as 16 big-endian two’s-complement bytes (not XDR)', () => {
    expect(bytesToHex(i128ToBytesBE(BigInt(500)))).toBe('000000000000000000000000000001f4');
    expect(bytesToHex(i128ToBytesBE(BigInt(-1)))).toBe('ffffffffffffffffffffffffffffffff');
    expect(bytesToHex(i128ToBytesBE(AMOUNTS[4]))).toBe('7fffffffffffffffffffffffffffffff');
    expect(() => i128ToBytesBE(AMOUNTS[4] + BigInt(1))).toThrow();
  });
});

describe('leaf hashing matches the contract', () => {
  it.each([0, 1, 2, 3, 4])('leaf %i equals compute_leaf', async (i) => {
    const leaf = await computeLeaf(claims(5)[i]);
    expect(leaf.hash).toBe(LEAVES[i]);
  });

  it('exposes the three concatenated fields', async () => {
    const leaf = await computeLeaf(claims(1)[0]);
    expect(leaf.parts.index).toBe('00000000');
    expect(leaf.parts.amount).toBe('000000000000000000000000000001f4');
    // ScVal::Address tag (18), address type (0 = account), key type (0 = ed25519),
    // then the 32-byte key: 4 + 4 + 4 + 32 = 44 bytes.
    expect(leaf.parts.account).toMatch(/^000000120000000000000000/);
    expect(leaf.parts.account).toHaveLength(44 * 2);
  });

  it('hashes a contract (C…) address as well as an account (G…)', async () => {
    const leaf = await computeLeaf(claims(4)[3]);
    expect(leaf.hash).toBe(LEAVES[3]);
    // Tag (18), address type (1 = contract), then the 32-byte contract id: 40 bytes.
    expect(leaf.parts.account).toMatch(/^0000001200000001/);
    expect(leaf.parts.account).toHaveLength(40 * 2);
  });

  it('rejects an invalid address', async () => {
    await expect(
      computeLeaf({ index: 0, account: 'not-an-address', amount: BigInt(1) })
    ).rejects.toThrow(/valid Stellar address/);
  });
});

describe('pair ordering', () => {
  it('puts the smaller hash first, whichever side it was on', async () => {
    const [a, b] = [LEAVES[0], LEAVES[1]]; // b < a
    expect(orderPair(a, b)).toEqual([b, a]);
    expect(orderPair(b, a)).toEqual([b, a]);
    expect(await hashPair(a, b)).toBe(await hashPair(b, a));
    expect(await hashPair(a, b)).toBe(ROOTS[2]);
  });
});

describe('tree and proofs match the contract', () => {
  it.each([2, 3, 4, 5])('builds the contract root for %i leaves', async (n) => {
    const tree = await buildAirdropTree(claims(n));
    expect(tree.root.hash).toBe(ROOTS[n]);
  });

  it.each([2, 3, 4, 5])('generates the contract proofs for %i leaves', async (n) => {
    const tree = await buildAirdropTree(claims(n));
    for (let i = 0; i < n; i += 1) {
      expect(getProof(tree, i).map((s) => s.hash)).toEqual(PROOFS[n][i]);
    }
  });

  it.each([2, 3, 4, 5])('every proof verifies against the root for %i leaves', async (n) => {
    const tree = await buildAirdropTree(claims(n));
    for (let i = 0; i < n; i += 1) {
      const result = await verifyClaim(claims(n)[i], getProof(tree, i), tree.root.hash, {
        tree,
        leafPosition: i,
      });
      expect(result.valid).toBe(true);
      expect(result.outcome).toEqual({ status: 'Ok' });
      expect(result.computedRoot).toBe(ROOTS[n]);
      expect(result.steps.every((s) => s.matchesTree)).toBe(true);
      expect(result.leafMatchesTree).toBe(true);
    }
  });

  it('promotes an unpaired node instead of duplicating it', async () => {
    const tree = await buildAirdropTree(claims(3));
    // Leaf 2 is unpaired at level 0, so it is carried up with no proof step there.
    expect(getProof(tree, 2)).toHaveLength(1);
    expect(tree.levels[1][1].promoted).toBe(true);
    expect(tree.levels[1][1].hash).toBe(tree.levels[0][2].hash);
  });

  it('handles a single leaf: empty proof, root is the leaf', async () => {
    const tree = await buildAirdropTree(claims(1));
    expect(tree.root.hash).toBe(LEAVES[0]);
    expect(getProof(tree, 0)).toEqual([]);
    const result = await verifyClaim(claims(1)[0], [], tree.root.hash);
    expect(result.valid).toBe(true);
  });

  it('exposes path and sibling ids for highlighting', async () => {
    const tree = await buildAirdropTree(claims(4));
    expect(getPathNodeIds(tree, 0)).toEqual(['L0-0', 'L1-0', 'L2-0']);
    expect(getSiblingNodeIds(tree, getProof(tree, 0))).toEqual(['L0-1', 'L1-1']);
  });

  it('rejects empty input, duplicate indices and non-positive amounts', async () => {
    await expect(buildAirdropTree([])).rejects.toThrow(/at least one/i);
    const [a, b] = claims(2);
    await expect(buildAirdropTree([a, { ...b, index: 0 }])).rejects.toThrow(
      /Duplicate claim index/
    );
    await expect(buildAirdropTree([{ ...a, amount: BigInt(0) }])).rejects.toThrow(/non-positive/);
  });
});

describe('verification mirrors the contract outcomes', () => {
  it('reports InvalidProof (404) for an inflated amount, diverging from the first step', async () => {
    const tree = await buildAirdropTree(claims(5));
    const honest = claims(5)[0];
    const result = await verifyClaim(
      { ...honest, amount: honest.amount + BigInt(1) },
      getProof(tree, 0),
      tree.root.hash,
      { tree, leafPosition: 0 }
    );
    expect(result.valid).toBe(false);
    expect(result.outcome).toEqual({ status: 'InvalidProof', code: 404 });
    expect(result.leafMatchesTree).toBe(false);
    // A wrong leaf poisons every parent above it.
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.every((s) => s.matchesTree === false)).toBe(true);
    expect(result.computedRoot).not.toBe(tree.root.hash);
  });

  it('reports InvalidProof for a spoofed index, a wrong account, and a corrupted sibling', async () => {
    const tree = await buildAirdropTree(claims(5));
    const honest = claims(5)[2];
    const proof = getProof(tree, 2);

    const wrongIndex = await verifyClaim({ ...honest, index: 3 }, proof, tree.root.hash, {
      tree,
      leafPosition: 2,
    });
    expect(wrongIndex.outcome.status).toBe('InvalidProof');

    const wrongAccount = await verifyClaim(
      { ...honest, account: ADDRESSES[0] },
      proof,
      tree.root.hash
    );
    expect(wrongAccount.outcome.status).toBe('InvalidProof');

    const corrupted = proof.map((s, i) => (i === 1 ? { ...s, hash: `ff${s.hash.slice(2)}` } : s));
    const result = await verifyClaim(honest, corrupted, tree.root.hash, { tree, leafPosition: 2 });
    expect(result.outcome.status).toBe('InvalidProof');
    // The leaf and the first step are fine; the corruption shows at step 2 and stays red.
    expect(result.leafMatchesTree).toBe(true);
    expect(result.steps.map((s) => s.matchesTree)).toEqual([true, false, false]);
  });

  it('rejects a zero amount with ZeroAmount (407) before hashing, like the contract', async () => {
    const tree = await buildAirdropTree(claims(2));
    const result = await verifyClaim(
      { ...claims(2)[0], amount: BigInt(0) },
      getProof(tree, 0),
      tree.root.hash
    );
    expect(result.outcome).toEqual({ status: 'ZeroAmount', code: 407 });
    expect(result.steps).toEqual([]);
    expect(result.valid).toBe(false);
  });

  it('records the exact preimage and which side the carried hash took', async () => {
    const tree = await buildAirdropTree(claims(2));
    const result = await verifyClaim(claims(2)[0], getProof(tree, 0), tree.root.hash);
    const [step] = result.steps;
    // leaf 1 (ebe6…) < leaf 0 (f57f…), so the sibling goes first.
    expect(step.first).toBe(LEAVES[1]);
    expect(step.second).toBe(LEAVES[0]);
    expect(step.currentIsFirst).toBe(false);
    expect(step.preimage).toBe(LEAVES[1] + LEAVES[0]);
    expect(step.resultHash).toBe(ROOTS[2]);
  });
});

describe('Soroban submission formatting', () => {
  it('formats the four claim_airdrop arguments', async () => {
    const tree = await buildAirdropTree(claims(5));
    const claim = claims(5)[2];
    const proof = getProof(tree, 2);
    const submission = formatClaimSubmission(claim, proof, { root: tree.root.hash });

    expect(submission.functionName).toBe('claim_airdrop');
    expect(submission.args).toEqual({
      index: 2,
      account: ADDRESSES[2],
      amount: '1000000000000',
      proof: PROOFS[5][2],
    });

    // Each ScVal decodes back to the contract's parameter types.
    const index = xdr.ScVal.fromXDR(submission.scVals.index, 'base64');
    expect(index.switch().name).toBe('scvU32');
    expect(scValToNative(index)).toBe(2);

    const account = xdr.ScVal.fromXDR(submission.scVals.account, 'base64');
    expect(Address.fromScVal(account).toString()).toBe(ADDRESSES[2]);

    const amount = xdr.ScVal.fromXDR(submission.scVals.amount, 'base64');
    expect(amount.switch().name).toBe('scvI128');
    expect(scValToNative(amount)).toBe(BigInt('1000000000000'));

    const proofVec = xdr.ScVal.fromXDR(submission.scVals.proof, 'base64');
    expect(proofVec.switch().name).toBe('scvVec');
    const elements = proofVec.vec()!.map((v) => {
      expect(v.switch().name).toBe('scvBytes');
      return bytesToHex(v.bytes());
    });
    expect(elements).toEqual(PROOFS[5][2]);
  });

  it('builds the CLI invocations with a placeholder or the supplied contract id', async () => {
    const tree = await buildAirdropTree(claims(2));
    const proof = getProof(tree, 0);

    const generic = formatClaimSubmission(claims(2)[0], proof, { root: tree.root.hash });
    expect(generic.cli).toContain('--id <CONTRACT_ID>');
    expect(generic.cli).toContain('-- claim_airdrop --index 0');
    expect(generic.cli).toContain(`--account ${ADDRESSES[0]} --amount 500`);
    expect(generic.cli).toContain(`--proof '["${PROOFS[2][0][0]}"]'`);
    expect(generic.verifyCli).toContain('-- verify_airdrop_proof');
    expect(generic.verifyCli).toContain(`--root ${ROOTS[2]}`);

    const contractId = ADDRESSES[3];
    const specific = formatClaimSubmission(claims(2)[0], proof, { contractId });
    expect(specific.cli).toContain(`--id ${contractId}`);
  });

  it('builds an invokeHostFunction operation for claim_airdrop', async () => {
    const tree = await buildAirdropTree(claims(2));
    const op = buildClaimOperation(
      ADDRESSES[3],
      claims(2)[0],
      getProof(tree, 0).map((s) => s.hash)
    );
    expect(op.body().switch().name).toBe('invokeHostFunction');
    const invoke = op.body().invokeHostFunctionOp().hostFunction().invokeContract();
    expect(invoke.functionName().toString()).toBe('claim_airdrop');
    expect(invoke.args()).toHaveLength(4);
  });

  it('refuses malformed arguments', () => {
    expect(() => formatClaimSubmission(claims(1)[0], ['zz'])).toThrow(/32-byte hex/);
    expect(() => buildClaimOperation('GAAAA', claims(1)[0], [])).toThrow(/contract ID/);
  });
});

describe('parseClaimLines', () => {
  it('assigns indices in line order and skips blanks and comments', () => {
    const { claims: parsed, errors } = parseClaimLines(
      `# header\n${ADDRESSES[0]}, 500\n\n${ADDRESSES[1]} 750 # trailing note\n`
    );
    expect(errors).toEqual([]);
    expect(parsed).toEqual([
      { index: 0, account: ADDRESSES[0], amount: BigInt(500) },
      { index: 1, account: ADDRESSES[1], amount: BigInt(750) },
    ]);
  });

  it('accepts explicit indices and skips used ones when auto-assigning', () => {
    const { claims: parsed, errors } = parseClaimLines(
      `0, ${ADDRESSES[0]}, 5\n${ADDRESSES[1]}, 6\n`
    );
    expect(errors).toEqual([]);
    expect(parsed.map((c) => c.index)).toEqual([0, 1]);
  });

  it('reports each bad line without dropping the good ones', () => {
    const { claims: parsed, errors } = parseClaimLines(
      [
        `${ADDRESSES[0]}, 500`,
        'GNOTANADDRESS, 5',
        `${ADDRESSES[1]}, -4`,
        `${ADDRESSES[1]}, 1.5`,
        `${ADDRESSES[1]}, 0`,
        'just-one-field',
        `0, ${ADDRESSES[2]}, 9`,
      ].join('\n')
    );
    expect(parsed).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(errors[0].message).toMatch(/valid Stellar address/);
    expect(errors[5].message).toMatch(/already used/);
  });

  it('caps the number of claims', () => {
    const lines = Array.from({ length: 5 }, () => `${ADDRESSES[0]}, 1`).join('\n');
    const { claims: parsed, errors } = parseClaimLines(lines, 3);
    expect(parsed).toHaveLength(3);
    expect(errors).toHaveLength(2);
  });
});
