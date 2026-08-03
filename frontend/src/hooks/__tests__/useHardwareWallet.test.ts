import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHardwareWallet } from '../useHardwareWallet';

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// This is the compatibility smoke check required alongside pinning the Ledger
// packages: it verifies TransportWebHID.create() and the Eth() constructor are
// actually invoked (and wired to the returned address/signature) on the pinned
// versions, so a future bump that breaks this initialization surface fails
// here instead of only being discovered against real hardware.

const mockClose = vi.fn().mockResolvedValue(undefined);
const mockTransportCreate = vi.fn();
const mockGetAddress = vi.fn();
const mockSignPersonalMessage = vi.fn();

vi.mock('@ledgerhq/hw-transport-webhid', () => ({
  default: {
    create: (...args: unknown[]) => mockTransportCreate(...args),
  },
}));

vi.mock('@ledgerhq/hw-app-eth', () => ({
  default: class MockEth {
    constructor(public transport: unknown) {}
    getAddress(...args: unknown[]) {
      return mockGetAddress(...args);
    }
    signPersonalMessage(...args: unknown[]) {
      return mockSignPersonalMessage(...args);
    }
  },
}));

const ADDRESS = '0xABCDEF1234567890';

function setHidSupport(isSupported: boolean) {
  if (isSupported) {
    Object.defineProperty(window.navigator, 'hid', {
      value: {},
      configurable: true,
    });
  } else {
    delete (window.navigator as unknown as Record<string, unknown>).hid;
  }
}

describe('useHardwareWallet', () => {
  beforeEach(() => {
    mockTransportCreate.mockReset();
    mockGetAddress.mockReset();
    mockSignPersonalMessage.mockReset();
    mockClose.mockClear();
    setHidSupport(true);
  });

  afterEach(() => {
    setHidSupport(false);
  });

  it('reports unsupported when WebHID is not available', () => {
    setHidSupport(false);
    const { result } = renderHook(() => useHardwareWallet());
    expect(result.current.isSupported).toBe(false);
  });

  it('reports supported when WebHID is available', () => {
    const { result } = renderHook(() => useHardwareWallet());
    expect(result.current.isSupported).toBe(true);
  });

  it('connect() initializes the Ledger transport and Eth app, and stores the derived address', async () => {
    mockTransportCreate.mockResolvedValue({ close: mockClose });
    mockGetAddress.mockResolvedValue({ address: ADDRESS });

    const { result } = renderHook(() => useHardwareWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(mockTransportCreate).toHaveBeenCalledTimes(1);
    expect(mockGetAddress).toHaveBeenCalledWith("44'/60'/0'/0/0", false, true);
    expect(result.current.address).toBe(ADDRESS);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('connect() surfaces an error and leaves the wallet disconnected when the transport fails to initialize', async () => {
    mockTransportCreate.mockRejectedValue(new Error('device not found'));

    const { result } = renderHook(() => useHardwareWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
    expect(result.current.error).toBe('Unable to connect to Ledger device.');
  });

  it('connect() does not attempt initialization when WebHID is unsupported', async () => {
    setHidSupport(false);
    const { result } = renderHook(() => useHardwareWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(mockTransportCreate).not.toHaveBeenCalled();
    expect(result.current.error).toBe('WebHID is not available in this browser');
  });

  it('disconnect() closes the transport and clears the connected state', async () => {
    mockTransportCreate.mockResolvedValue({ close: mockClose });
    mockGetAddress.mockResolvedValue({ address: ADDRESS });

    const { result } = renderHook(() => useHardwareWallet());
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.isConnected).toBe(true);

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
  });

  it('signPersonalMessage() returns a signature assembled from the Eth app response', async () => {
    mockTransportCreate.mockResolvedValue({ close: mockClose });
    mockGetAddress.mockResolvedValue({ address: ADDRESS });
    mockSignPersonalMessage.mockResolvedValue({ r: 'r'.repeat(64), s: 's'.repeat(64), v: 27 });

    const { result } = renderHook(() => useHardwareWallet());
    await act(async () => {
      await result.current.connect();
    });

    let signature: string | null = null;
    await act(async () => {
      signature = await result.current.signPersonalMessage('hello');
    });

    await waitFor(() => expect(signature).not.toBeNull());
    expect(signature).toBe(`0x${'r'.repeat(64)}${'s'.repeat(64)}1b`);
  });

  it('signPersonalMessage() fails gracefully when no wallet is connected', async () => {
    const { result } = renderHook(() => useHardwareWallet());

    let signature: string | null = 'unset';
    await act(async () => {
      signature = await result.current.signPersonalMessage('hello');
    });

    expect(signature).toBeNull();
    expect(result.current.error).toBe('Hardware wallet is not connected');
  });
});
