import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatFee, simulateWeb3Transaction } from '../web3-transaction-simulator';

function mockFetch(results: unknown[]) {
  const fetchMock = vi.fn();
  for (const result of results) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 'test', result }),
    });
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('web3-transaction-simulator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('simulates Stellar transactions and applies a congestion-aware resource fee buffer', async () => {
    const fetchMock = mockFetch([
      {
        latestLedger: 123,
        minResourceFee: '1000',
        transactionData: 'tx-data',
        events: ['event-xdr'],
        results: [{ xdr: 'retval' }],
        cost: { cpuInsns: '200', memBytes: '300' },
        stateChanges: [
          {
            type: 'updated',
            key: 'not-base64',
            before: 'not-base64-before',
            after: 'not-base64-after',
          },
        ],
      },
      {
        sorobanInclusionFee: {
          min: '100',
          p50: '100',
          p90: '250',
          p95: '280',
          p99: '400',
          max: '500',
        },
      },
    ]);

    const result = await simulateWeb3Transaction({
      network: 'stellar',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      transactionXdr: 'AAAA',
      instructionLeeway: 50000,
    });

    expect(result.status).toBe('success');
    expect(result.fee.congestion).toBe('high');
    expect(result.fee.bufferPercent).toBe(35);
    expect(result.fee.bufferedFee).toBe(1687n);
    expect(result.stateChanges[0].description).toContain('will be updated');
    expect(fetchMock.mock.calls[1][1]?.body).not.toContain('"params"');
  });

  it('uses Stellar classic inclusion fee fallback and reports restore/error diagnostics', async () => {
    mockFetch([
      {
        error: 'host function reverted',
        minResourceFee: '0',
        restorePreamble: { minResourceFee: '20', transactionData: 'restore' },
        stateChanges: [{ type: 'deleted', key: 'not-base64' }],
      },
      {
        inclusionFee: {
          min: '100',
          p50: '100',
          p90: '120',
          p95: '130',
          p99: '150',
          max: '200',
        },
      },
    ]);

    const result = await simulateWeb3Transaction({
      network: 'stellar',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      transactionXdr: 'AAAA',
    });

    expect(result.status).toBe('reverted');
    expect(result.summary).toBe('host function reverted');
    expect(result.fee.congestion).toBe('low');
    expect(result.diagnostics.join(' ')).toContain('RestoreFootprint');
    expect(result.stateChanges[0].description).toContain('will be deleted');
  });

  it('handles Stellar simulations with unknown state-change types and no fee stats', async () => {
    mockFetch([
      {
        minResourceFee: '10',
        stateChanges: [{ key: 'not-base64' }],
      },
      {},
    ]);

    const result = await simulateWeb3Transaction({
      network: 'stellar',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      transactionXdr: 'AAAA',
    });

    expect(result.fee.congestion).toBe('low');
    expect(result.fee.bufferedFee).toBe(123n);
    expect(result.stateChanges[0].description).toContain('impact returned');
  });

  it('uses EVM trace_call stateDiff when the selected RPC supports it', async () => {
    mockFetch([
      '0x',
      '0x5208',
      { baseFeePerGas: ['0x1', '0x2'], gasUsedRatio: [0.9, 0.8] },
      {
        stateDiff: {
          '0xabc': {
            balance: { from: '0x1', to: '0x2' },
          },
        },
      },
    ]);

    const result = await simulateWeb3Transaction({
      network: 'evm',
      rpcUrl: 'https://example-rpc.invalid',
      transaction: { to: '0xabc', data: '0x' },
    });

    expect(result.status).toBe('success');
    expect(result.gasLimit).toBe(27300n);
    expect(result.stateChanges[0].target).toBe('0xabc.balance');
    expect(result.diagnostics.join(' ')).toContain('Buffered gas limit');
  });

  it('represents account-level EVM trace changes', async () => {
    mockFetch([
      '0x',
      '0x5208',
      { baseFeePerGas: ['0x1'], gasUsedRatio: [0.2] },
      { stateDiff: { '0xempty': {} } },
    ]);

    const result = await simulateWeb3Transaction({
      network: 'evm',
      rpcUrl: 'https://example-rpc.invalid',
      transaction: { to: '0xempty', data: '0x' },
    });

    expect(result.stateChanges[0].target).toBe('0xempty');
    expect(result.stateChanges[0].type).toBe('unknown');
  });

  it('uses debug_traceCall state diffs when trace_call is unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: '0xbeef' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: '5208' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: undefined }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: { code: -32601, message: 'method not found' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { post: { '0xdef': { storage: { '*': { from: '0x0', to: '0x1' } } } } },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await simulateWeb3Transaction({
      network: 'evm',
      rpcUrl: 'https://example-rpc.invalid',
      transaction: { to: '0xdef', data: '0x' },
    });

    expect(result.returnValue).toBe('0xbeef');
    expect(result.fee.congestion).toBe('low');
    expect(result.stateChanges[0].target).toBe('0xdef.storage');
    expect(result.diagnostics.join(' ')).toContain('debug_traceCall');
  });

  it('can disable EVM tracing explicitly', async () => {
    const fetchMock = mockFetch([
      '0x',
      '0x5208',
      { baseFeePerGas: ['0x1'], gasUsedRatio: [0.66] },
    ]);

    const result = await simulateWeb3Transaction({
      network: 'evm',
      rpcUrl: 'https://example-rpc.invalid',
      transaction: { data: '0x' },
      traceMode: 'none',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.fee.congestion).toBe('medium');
    expect(result.stateChanges[0].target).toBe('contract-creation');
    expect(result.diagnostics.join(' ')).toContain('disabled');
  });

  it('falls back clearly when EVM trace endpoints are unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: '0x' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: '0x5208' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { baseFeePerGas: ['0x1'], gasUsedRatio: [0.2] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: { code: -32601, message: 'method not found' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: { code: -32601, message: 'method not found' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await simulateWeb3Transaction({
      network: 'evm',
      rpcUrl: 'https://example-rpc.invalid',
      transaction: { to: '0xabc', data: '0x' },
    });

    expect(result.stateChanges[0].description).toContain('No exact state diff');
    expect(result.diagnostics.join(' ')).toContain('trace_call or debug_traceCall');
  });

  it('surfaces EVM call reverts while still returning gas guidance', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: { code: 3, message: 'execution reverted' } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: '0x5208' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { baseFeePerGas: ['0x1'], gasUsedRatio: [0.1] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: { code: -32601, message: 'method not found' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: { code: -32601, message: 'method not found' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await simulateWeb3Transaction({
      network: 'evm',
      rpcUrl: 'https://example-rpc.invalid',
      transaction: { to: '0xabc', data: '0x' },
    });

    expect(result.status).toBe('reverted');
    expect(result.summary).toBe('execution reverted');
    expect(result.gasLimit).toBe(23520n);
  });

  it('throws clear errors for transport and malformed RPC responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(
      simulateWeb3Transaction({
        network: 'stellar',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        transactionXdr: 'AAAA',
      })
    ).rejects.toThrow(/HTTP 503/);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    );

    await expect(
      simulateWeb3Transaction({
        network: 'stellar',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        transactionXdr: 'AAAA',
      })
    ).rejects.toThrow(/no result/i);
  });

  it('formats bigint fees for display', () => {
    expect(formatFee(1234567n)).toBe('1,234,567');
  });
});
