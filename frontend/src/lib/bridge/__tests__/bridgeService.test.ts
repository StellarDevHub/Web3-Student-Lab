import { describe, expect, it } from 'vitest';
import {
  mapRawBridgeTransaction,
  mapSepStatusToBridgeStatus,
  parseBridgeEndpointConfig,
  validateTransactionId,
} from '../bridgeService';

const endpoint = {
  id: 'test-anchor',
  label: 'Test Anchor',
  protocol: 'sep24' as const,
  baseUrl: 'https://anchor.example',
  assetCode: 'USDC',
  network: 'Test bridge',
};

describe('bridge service status mapping', () => {
  it('maps SEP pending, completed, failed, and refunded states', () => {
    expect(mapSepStatusToBridgeStatus('pending_anchor')).toBe('pending_anchor');
    expect(mapSepStatusToBridgeStatus('pending_external')).toBe('on_chain');
    expect(mapSepStatusToBridgeStatus('completed')).toBe('completed');
    expect(mapSepStatusToBridgeStatus('error')).toBe('failed');
    expect(mapSepStatusToBridgeStatus('expired')).toBe('failed');
    expect(mapSepStatusToBridgeStatus('refunded')).toBe('refunded');
  });

  it('maps SEP transaction payloads into tracker transactions', () => {
    const transaction = mapRawBridgeTransaction(
      {
        id: 'tx-123',
        kind: 'withdrawal',
        status: 'pending_external',
        amount_in: '25',
        asset_code: 'USDC',
        from: 'GABC',
        to: '0xabc',
        started_at: '2026-07-30T12:00:00Z',
        stellar_transaction_id: 'stellar-hash',
        external_transaction_id: 'external-hash',
      },
      endpoint
    );

    expect(transaction).toMatchObject({
      id: 'tx-123',
      status: 'on_chain',
      amount: '25',
      asset: 'USDC',
      sourceChain: 'Stellar',
      targetChain: 'Test bridge',
      sourceTxHash: 'stellar-hash',
      targetTxHash: 'external-hash',
    });
  });

  it('rejects invalid transaction identifiers', () => {
    expect(() => validateTransactionId('../../../etc/passwd')).toThrow(
      /Invalid bridge transaction identifier/
    );
  });

  it('parses JSON bridge endpoint configuration', () => {
    const config = parseBridgeEndpointConfig(
      JSON.stringify([
        {
          id: 'anchor',
          label: 'Anchor',
          protocol: 'sep6',
          baseUrl: 'https://anchor.example/',
          assetCode: 'USDC',
        },
      ])
    );

    expect(config).toEqual([
      {
        id: 'anchor',
        label: 'Anchor',
        protocol: 'sep6',
        baseUrl: 'https://anchor.example',
        assetCode: 'USDC',
        authToken: undefined,
        network: undefined,
        pollIntervalMs: undefined,
      },
    ]);
  });
});
