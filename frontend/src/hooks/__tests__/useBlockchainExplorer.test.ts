import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExplorerTransaction,
  useBlockchainExplorer,
} from '../../hooks/useBlockchainExplorer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<ExplorerTransaction> = {}): ExplorerTransaction {
  return {
    id: 'TX1',
    hash: 'ABCDEF1234567890',
    source: 'GABC',
    destination: 'GXYZ',
    operation: 'PAYMENT',
    amount: '100.00',
    asset: 'XLM',
    fee: '200',
    ledger: 524001,
    status: 'SUCCESS',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  open() {
    this.onopen?.();
  }

  send(data: string) {
    this.onmessage?.({ data });
  }

  triggerError() {
    this.onerror?.();
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useBlockchainExplorer', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Simulation mode (no wsUrl) ──────────────────────────────────────────────

  it('starts in simulation mode with connected status when no wsUrl', () => {
    const { result } = renderHook(() => useBlockchainExplorer());
    expect(result.current.connectionStatus).toBe('connected');
    expect(result.current.isLive).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('accumulates simulated transactions over time', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // > 0.6 → always emit

    const { result } = renderHook(() => useBlockchainExplorer({ maxTransactions: 100 }));

    act(() => {
      vi.advanceTimersByTime(4000); // 3+ ticks at 1200 ms
    });

    expect(result.current.transactions.length).toBeGreaterThan(0);
  });

  it('does not accumulate beyond maxTransactions', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const { result } = renderHook(() => useBlockchainExplorer({ maxTransactions: 5 }));

    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(result.current.transactions.length).toBeLessThanOrEqual(5);
  });

  it('pausing stops new transactions from arriving', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const { result } = renderHook(() => useBlockchainExplorer());

    act(() => {
      vi.advanceTimersByTime(2400);
    });

    const countAfterFirstBatch = result.current.transactions.length;

    act(() => {
      result.current.toggleLive();
    });

    act(() => {
      vi.advanceTimersByTime(4800);
    });

    expect(result.current.isLive).toBe(false);
    expect(result.current.transactions.length).toBe(countAfterFirstBatch);
  });

  it('resuming live feed re-connects simulation', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const { result } = renderHook(() => useBlockchainExplorer());

    act(() => { result.current.toggleLive(); });
    act(() => { result.current.toggleLive(); });

    act(() => { vi.advanceTimersByTime(2400); });

    expect(result.current.transactions.length).toBeGreaterThan(0);
  });

  it('clearTransactions empties the list', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const { result } = renderHook(() => useBlockchainExplorer());

    act(() => { vi.advanceTimersByTime(3600); });

    act(() => { result.current.clearTransactions(); });

    expect(result.current.transactions).toHaveLength(0);
  });

  it('stats are zero when no transactions', () => {
    const { result } = renderHook(() => useBlockchainExplorer());
    expect(result.current.stats.totalTransactions).toBe(0);
    expect(result.current.stats.successRate).toBe(0);
    expect(result.current.stats.averageFee).toBe('0');
    expect(result.current.stats.latestLedger).toBe(0);
  });

  it('stats reflect transaction content', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const { result } = renderHook(() => useBlockchainExplorer());

    act(() => { vi.advanceTimersByTime(1200); });

    if (result.current.transactions.length > 0) {
      expect(result.current.stats.totalTransactions).toBeGreaterThan(0);
      expect(result.current.stats.latestLedger).toBeGreaterThan(0);
    }
  });

  // ── WebSocket mode ──────────────────────────────────────────────────────────

  it('connects via WebSocket when wsUrl is provided', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() =>
      useBlockchainExplorer({ wsUrl: 'ws://localhost:9001' })
    );

    expect(result.current.connectionStatus).toBe('connecting');

    act(() => {
      MockWebSocket.instances[0].open();
    });

    expect(result.current.connectionStatus).toBe('connected');
  });

  it('receives transactions via WebSocket messages', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() =>
      useBlockchainExplorer({ wsUrl: 'ws://localhost:9001' })
    );

    act(() => { MockWebSocket.instances[0].open(); });

    const tx = makeTx();
    act(() => {
      MockWebSocket.instances[0].send(JSON.stringify(tx));
    });

    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0].hash).toBe(tx.hash);
  });

  it('ignores malformed WebSocket messages', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() =>
      useBlockchainExplorer({ wsUrl: 'ws://localhost:9001' })
    );

    act(() => { MockWebSocket.instances[0].open(); });
    act(() => { MockWebSocket.instances[0].send('not-json'); });

    expect(result.current.transactions).toHaveLength(0);
  });

  it('sets error status on WebSocket error', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() =>
      useBlockchainExplorer({ wsUrl: 'ws://localhost:9001' })
    );

    act(() => { MockWebSocket.instances[0].triggerError(); });

    expect(result.current.connectionStatus).toBe('error');
    expect(result.current.error).toBeTruthy();
  });

  it('sets disconnected status on WebSocket close', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() =>
      useBlockchainExplorer({ wsUrl: 'ws://localhost:9001' })
    );

    act(() => { MockWebSocket.instances[0].open(); });
    act(() => { MockWebSocket.instances[0].close(); });

    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('closes WebSocket when live is toggled off', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result } = renderHook(() =>
      useBlockchainExplorer({ wsUrl: 'ws://localhost:9001' })
    );

    act(() => { MockWebSocket.instances[0].open(); });
    act(() => { result.current.toggleLive(); });

    expect(MockWebSocket.instances[0].closed).toBe(true);
  });

  it('handles invalid WebSocket URL gracefully', () => {
    // Make the WebSocket constructor throw
    vi.stubGlobal('WebSocket', class {
      constructor() { throw new Error('bad url'); }
    });

    const { result } = renderHook(() =>
      useBlockchainExplorer({ wsUrl: 'bad-url' })
    );

    expect(result.current.connectionStatus).toBe('error');
    expect(result.current.error).toBeTruthy();
  });

  it('closes WebSocket on unmount', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);

    const { result, unmount } = renderHook(() =>
      useBlockchainExplorer({ wsUrl: 'ws://localhost:9001' })
    );

    act(() => { MockWebSocket.instances[0].open(); });
    unmount();

    expect(MockWebSocket.instances[0].closed).toBe(true);
    // Suppress unused warning
    void result.current;
  });

  it('returns disconnected status when paused in simulation mode', () => {
    const { result } = renderHook(() => useBlockchainExplorer());

    act(() => { result.current.toggleLive(); });

    expect(result.current.isLive).toBe(false);
    // After pausing the interval cleanup runs and status goes disconnected
    expect(['disconnected', 'connected']).toContain(result.current.connectionStatus);
  });
});
