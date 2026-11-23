import { describe, expect, it } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import {
  buildTransactionXdr,
  decodeEnvelope,
  NETWORKS,
  type OperationSpec,
} from '../xdr-inspector';

// Fixed keys rather than Keypair.random(): the SDK's RNG path is not available
// in the jsdom test environment, and stable keys keep failures reproducible.
const SOURCE = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
const OTHER = 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U';
const TOKEN = StrKey.encodeContract(Buffer.alloc(32, 3));
const NET = NETWORKS.testnet;

const base = (operations: OperationSpec[]) => ({
  sourceAccount: SOURCE,
  sequence: '1',
  fee: '100',
  networkPassphrase: NET,
  operations,
});

describe('buildTransactionXdr with token operations', () => {
  it('builds an approve as a SEP-41 allowance with spender, amount, and expiry', () => {
    const built = buildTransactionXdr(
      base([
        {
          id: 'a',
          type: 'approve',
          tokenContract: TOKEN,
          spender: OTHER,
          amount: '25000000',
          expiry: '500000',
        },
      ])
    );

    expect(built.ok).toBe(true);
    const decoded = decodeEnvelope(built.xdr!, NET);
    expect(decoded.ok).toBe(true);
    expect(decoded.operations?.[0].type).toBe('invokeHostFunction');
    expect(decoded.operations?.[0].details.spender).toBe(OTHER);
    expect(decoded.operations?.[0].details.amount).toBe('25000000');
  });

  it('builds a transfer with the recipient as the first argument', () => {
    const built = buildTransactionXdr(
      base([{ id: 't', type: 'transfer', tokenContract: TOKEN, destination: OTHER, amount: '1' }])
    );

    expect(built.ok).toBe(true);
    const decoded = decodeEnvelope(built.xdr!, NET);
    expect(decoded.operations?.[0].details.destination).toBe(OTHER);
    expect(decoded.operations?.[0].details.amount).toBe('1');
  });

  it('assembles approve then transfer into one envelope', () => {
    const built = buildTransactionXdr(
      base([
        { id: 'a', type: 'approve', tokenContract: TOKEN, spender: OTHER, amount: '25000000' },
        { id: 't', type: 'transfer', tokenContract: TOKEN, destination: OTHER, amount: '25000000' },
      ])
    );

    expect(built.ok).toBe(true);
    expect(built.operationCount).toBe(2);
    expect(decodeEnvelope(built.xdr!, NET).operations).toHaveLength(2);
  });

  it('orders operations exactly as given', () => {
    const built = buildTransactionXdr(
      base([
        { id: 'p', type: 'payment', destination: OTHER, amount: '1' },
        { id: 'a', type: 'approve', tokenContract: TOKEN, spender: OTHER, amount: '1' },
        { id: 't', type: 'transfer', tokenContract: TOKEN, destination: OTHER, amount: '1' },
      ])
    );

    const decoded = decodeEnvelope(built.xdr!, NET);
    expect(decoded.operations?.map((o) => o.index)).toEqual([0, 1, 2]);
    expect(decoded.operations?.[0].type).toBe('payment');
    expect(decoded.operations?.[2].type).toBe('invokeHostFunction');
  });

  it('rejects a decimal token amount instead of silently truncating it', () => {
    const built = buildTransactionXdr(
      base([{ id: 't', type: 'transfer', tokenContract: TOKEN, destination: OTHER, amount: '2.5' }])
    );

    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/whole number of stroops/i);
  });

  it('requires a token contract for token operations', () => {
    const built = buildTransactionXdr(
      base([{ id: 't', type: 'transfer', destination: OTHER, amount: '1' }])
    );

    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/tokenContract/i);
  });

  it('charges one inclusion fee multiplied by the operation count', () => {
    const built = buildTransactionXdr(
      base([
        { id: 'p', type: 'payment', destination: OTHER, amount: '1' },
        { id: 'p2', type: 'payment', destination: OTHER, amount: '2' },
        { id: 'p3', type: 'payment', destination: OTHER, amount: '3' },
      ])
    );

    expect(built.totalFee).toBe('300');
    expect(built.operationCount).toBe(3);
  });
});
