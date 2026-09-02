import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBridgeTracker } from '../useBridgeTracker';
import type { BridgeStatusService, BridgeTransaction } from '../types';

const endpoint = {
  id: 'anchor',
  label: 'Anchor',
  protocol: 'sep24' as const,
  baseUrl: 'https://anchor.example',
  pollIntervalMs: 5000,
};

const transaction: BridgeTransaction = {
  id: 'tx-1',
  sourceChain: 'Anchor',
  targetChain: 'Stellar',
  amount: '10',
  asset: 'USDC',
  sender: 'sender',
  recipient: 'recipient',
  status: 'pending_anchor',
  timestamp: new Date('2026-07-30T12:00:00Z'),
};

describe('useBridgeTracker polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls configured bridge services and skips duplicate in-flight requests', async () => {
    let resolveFirst: (value: BridgeTransaction[]) => void = () => {};
    const firstRequest = new Promise<BridgeTransaction[]>((resolve) => {
      resolveFirst = resolve;
    });
    const service: BridgeStatusService = {
      listTransactions: vi.fn(() => firstRequest),
      getTransactionStatus: vi.fn(),
    };
    const endpoints = [endpoint];

    const { result } = renderHook(() =>
      useBridgeTracker({ endpoints, service, autoRefresh: true })
    );

    const initialCalls = vi.mocked(service.listTransactions).mock.calls.length;
    expect(initialCalls).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(service.listTransactions).toHaveBeenCalledTimes(initialCalls);

    await act(async () => {
      resolveFirst([transaction]);
      await firstRequest;
    });
    expect(result.current.transactions).toHaveLength(1);

    vi.mocked(service.listTransactions).mockResolvedValue([transaction]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(service.listTransactions).toHaveBeenCalledTimes(initialCalls + 1);
  });

  it('aborts polling requests on unmount', () => {
    const signals: AbortSignal[] = [];
    const service: BridgeStatusService = {
      listTransactions: vi.fn((_endpoints, signal) => {
        if (signal) signals.push(signal);
        return new Promise<BridgeTransaction[]>(() => {});
      }),
      getTransactionStatus: vi.fn(),
    };
    const endpoints = [endpoint];

    const { unmount } = renderHook(() =>
      useBridgeTracker({ endpoints, service, autoRefresh: true })
    );

    unmount();

    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
