import { Networks, StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import {
  buildTransactionXdr,
  decodeEnvelope,
  emptySpec,
  randomKeypair,
  verifyRoundTrip,
  type TransactionSpec,
} from '../xdr-inspector';

const keys = randomKeypair();
const destination = randomKeypair().publicKey;

function paymentSpec(): TransactionSpec {
  return {
    ...emptySpec(keys.publicKey),
    operations: [
      { id: 'op1', type: 'payment', destination, amount: '10', assetCode: 'XLM' },
    ],
  };
}

describe('building', () => {
  it('produces a Base64 envelope for a payment', () => {
    const result = buildTransactionXdr(paymentSpec());
    expect(result.ok).toBe(true);
    expect(result.xdr).toEqual(expect.any(String));
    expect(result.operationCount).toBe(1);
  });

  it('charges the base fee per operation', () => {
    const spec = paymentSpec();
    const two = buildTransactionXdr({
      ...spec,
      operations: [
        ...spec.operations,
        { id: 'op2', type: 'payment', destination, amount: '2', assetCode: 'XLM' },
      ],
    });

    // The fee on the envelope is the total, not the per-operation figure.
    expect(Number(two.totalFee)).toBe(Number(spec.fee) * 2);
  });

  it('returns errors rather than throwing, since every field is user-editable', () => {
    expect(buildTransactionXdr({ ...paymentSpec(), sourceAccount: '' }).ok).toBe(false);
    expect(buildTransactionXdr({ ...emptySpec(keys.publicKey), operations: [] }).ok).toBe(false);

    const badDestination = buildTransactionXdr({
      ...paymentSpec(),
      operations: [{ id: 'op1', type: 'payment', destination: 'nonsense', amount: '1' }],
    });
    expect(badDestination.ok).toBe(false);
    expect(badDestination.error).toEqual(expect.any(String));
  });

  it('requires an issuer for a non-native asset', () => {
    const result = buildTransactionXdr({
      ...paymentSpec(),
      operations: [{ id: 'op1', type: 'payment', destination, amount: '1', assetCode: 'USDC' }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/issuer/);
  });
});

describe('decoding', () => {
  it('round-trips source, operations and asset', () => {
    const built = buildTransactionXdr(paymentSpec());
    const decoded = decodeEnvelope(built.xdr!, Networks.TESTNET);

    expect(decoded.ok).toBe(true);
    expect(decoded.sourceAccount).toBe(keys.publicKey);
    expect(decoded.operations?.[0].type).toBe('payment');
    expect(decoded.operations?.[0].details.destination).toBe(destination);
    expect(decoded.operations?.[0].details.asset).toBe('XLM (native)');
    expect(decoded.transactionHash).toHaveLength(64);
  });

  it('records signatures only when the transaction is signed', () => {
    const unsigned = buildTransactionXdr(paymentSpec());
    const signed = buildTransactionXdr(paymentSpec(), keys.secret);

    expect(decodeEnvelope(unsigned.xdr!, Networks.TESTNET).signatureCount).toBe(0);
    expect(decodeEnvelope(signed.xdr!, Networks.TESTNET).signatureCount).toBe(1);
  });

  it('produces a different hash per network for the same envelope', () => {
    const built = buildTransactionXdr(paymentSpec());
    const onTestnet = decodeEnvelope(built.xdr!, Networks.TESTNET).transactionHash;
    const onPublic = decodeEnvelope(built.xdr!, Networks.PUBLIC).transactionHash;

    // Signatures commit to a hash that includes the passphrase - this is what
    // stops a testnet transaction being replayed on the public network.
    expect(onTestnet).not.toBe(onPublic);
  });

  it('rejects garbage without throwing', () => {
    expect(decodeEnvelope('not-xdr', Networks.TESTNET).ok).toBe(false);
    expect(decodeEnvelope('', Networks.TESTNET).ok).toBe(false);
  });
});

describe('operation coverage', () => {
  it('builds and decodes createAccount', () => {
    const built = buildTransactionXdr({
      ...paymentSpec(),
      operations: [{ id: 'op1', type: 'createAccount', destination, startingBalance: '5' }],
    });
    expect(built.ok).toBe(true);
    expect(decodeEnvelope(built.xdr!, Networks.TESTNET).operations?.[0].type).toBe('createAccount');
  });

  it('distinguishes a manageData value from a deletion', () => {
    const withValue = buildTransactionXdr({
      ...paymentSpec(),
      operations: [{ id: 'op1', type: 'manageData', name: 'course', value: 'stellar-101' }],
    });
    const deletion = buildTransactionXdr({
      ...paymentSpec(),
      operations: [{ id: 'op1', type: 'manageData', name: 'course' }],
    });

    expect(decodeEnvelope(withValue.xdr!, Networks.TESTNET).operations?.[0].details.value).toBe('stellar-101');
    // An absent value deletes the entry; that is not the same as storing "".
    expect(decodeEnvelope(deletion.xdr!, Networks.TESTNET).operations?.[0].details.value).toBe('(deleted)');
  });

  it('carries a non-native asset as code:issuer', () => {
    const issuer = randomKeypair().publicKey;
    const built = buildTransactionXdr({
      ...paymentSpec(),
      operations: [
        { id: 'op1', type: 'payment', destination, amount: '1', assetCode: 'USDC', assetIssuer: issuer },
      ],
    });
    expect(decodeEnvelope(built.xdr!, Networks.TESTNET).operations?.[0].details.asset).toBe(`USDC:${issuer}`);
  });

  it('builds a Soroban invokeHostFunction operation', () => {
    const contractId = StrKey.encodeContract(Buffer.alloc(32, 7));
    const built = buildTransactionXdr({
      ...paymentSpec(),
      operations: [{ id: 'op1', type: 'invokeHostFunction', contractId, functionName: 'increment' }],
    });

    expect(built.ok).toBe(true);
    expect(decodeEnvelope(built.xdr!, Networks.TESTNET).operations?.[0].type).toBe('invokeHostFunction');
  });

  it('round-trips a text memo', () => {
    const built = buildTransactionXdr({ ...paymentSpec(), memo: { type: 'text', value: 'hello' } });
    expect(decodeEnvelope(built.xdr!, Networks.TESTNET).memo?.value).toBe('hello');
  });
});

describe('verifyRoundTrip', () => {
  it('confirms the JSON and XDR views describe one object', () => {
    const result = verifyRoundTrip(paymentSpec());
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/round-tripped/);
  });

  it('reports the reason when a spec cannot be built', () => {
    expect(verifyRoundTrip({ ...emptySpec(keys.publicKey), operations: [] }).ok).toBe(false);
  });
});
