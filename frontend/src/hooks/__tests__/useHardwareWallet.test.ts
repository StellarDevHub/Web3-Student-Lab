import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHardwareWallet } from '../useHardwareWallet';

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// The hardware wallet gateway talks to a Ledger running the Stellar app through
// either WebHID or WebUSB, and uses @ledgerhq/hw-app-str (the `Str` client) to
// derive addresses and sign transactions. We mock the transports and the Str
// client so we can assert the exact initialization + signing surface the hook
// uses — a change in those pinned packages that breaks this surface fails here
// before it ever reaches real hardware.

const mockClose = vi.fn().mockResolvedValue(undefined);
const mockWebhidCreate = vi.fn();
const mockWebusbCreate = vi.fn();
const mockGetPublicKey = vi.fn();
const mockSignTransaction = vi.fn();

vi.mock('@ledgerhq/hw-transport-webhid', () => ({
  default: {
    create: (...args: unknown[]) => mockWebhidCreate(...args),
  },
}));

vi.mock('@ledgerhq/hw-transport-webusb', () => ({
  default: {
    create: (...args: unknown[]) => mockWebusbCreate(...args),
  },
}));

vi.mock('@ledgerhq/hw-app-str', () => ({
  default: class MockStr {
    constructor(public transport: unknown) {}
    getPublicKey(...args: unknown[]) {
      return mockGetPublicKey(...args);
    }
    signTransaction(...args: unknown[]) {
      return mockSignTransaction(...args);
    }
  },
}));

const PUBLIC_KEY = 'GBADDRESSMAINNETPUBLICKEYEXAMPLESTRING';
const DEFAULT_PATH = "44'/148'/0'";

function setHydrusSupport(hid: boolean, usb: boolean) {
  const nav = window.navigator as unknown as Record<string, unknown>;
  if (hid) {
    Object.defineProperty(window.navigator, 'hid', { value: {}, configurable: true });
  } else {
    delete nav.hid;
  }
  if (usb) {
    Object.defineProperty(window.navigator, 'usb', { value: {}, configurable: true });
  } else {
    delete nav.usb;
  }
}

describe('useHardwareWallet', () => {
  beforeEach(() => {
    mockWebhidCreate.mockReset();
    mockWebusbCreate.mockReset();
    mockGetPublicKey.mockReset();
    mockSignTransaction.mockReset();
    mockClose.mockClear();
    setHydrusSupport(true, true);
  });

  afterEach(() => {
    setHydrusSupport(false, false);
  });

  it('reports unsupported when neither WebHID nor WebUSB is available', () => {
    setHydrusSupport(false, false);
    const { result } = renderHook(() => useHardwareWallet());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.supportedTransports).toEqual([]);
  });

  it('reports the supported transports', () => {
    setHydrusSupport(true, true);
    const { result } = renderHook(() => useHardwareWallet());
    expect(result.current.isSupported).toBe(true);
    expect(result.current.supportedTransports).toContain('webhid');
    expect(result.current.supportedTransports).toContain('webusb');
  });

  it('connect() creates a transport, derives the Stellar address, and stores it', async () => {
    mockWebhidCreate.mockResolvedValue({ close: mockClose });
    mockGetPublicKey.mockResolvedValue({ publicKey: PUBLIC_KEY });

    const { result } = renderHook(() => useHardwareWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(mockWebhidCreate).toHaveBeenCalledTimes(1);
    expect(mockGetPublicKey).toHaveBeenCalledWith(DEFAULT_PATH);
    expect(result.current.address).toBe(PUBLIC_KEY);
    expect(result.current.publicKey).toBe(PUBLIC_KEY);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.derivationPath).toBe(`m/${DEFAULT_PATH}`);
  });

  it('connect() honors an explicit transport + derivation path', async () => {
    mockWebusbCreate.mockResolvedValue({ close: mockClose });
    mockGetPublicKey.mockResolvedValue({ publicKey: PUBLIC_KEY });

    const { result } = renderHook(() => useHardwareWallet());

    await act(async () => {
      await result.current.connect({ transport: 'webusb', derivationPath: "m/44'/148'/0'/1'" });
    });

    expect(mockWebusbCreate).toHaveBeenCalledTimes(1);
    expect(mockGetPublicKey).toHaveBeenCalledWith("44'/148'/0'/1'");
    expect(result.current.isConnected).toBe(true);
  });

  it('connect() surfaces an error and stays disconnected when all transports fail', async () => {
    mockWebhidCreate.mockRejectedValue(new Error('device not found'));
    mockWebusbCreate.mockRejectedValue(new Error('device not found'));

    const { result } = renderHook(() => useHardwareWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
    expect(mockWebhidCreate).toHaveBeenCalled();
    expect(mockWebusbCreate).toHaveBeenCalled();
    expect(result.current.error).toBe('device not found');
  });

  it('connect() does not attempt initialization when WebHID/WebUSB is unsupported', async () => {
    setHydrusSupport(false, false);
    const { result } = renderHook(() => useHardwareWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(mockWebhidCreate).not.toHaveBeenCalled();
    expect(mockWebusbCreate).not.toHaveBeenCalled();
    expect(result.current.error).toBe('WebHID/WebUSB is not available in this browser');
  });

  it('disconnect() closes the transport and clears the connected state', async () => {
    mockWebhidCreate.mockResolvedValue({ close: mockClose });
    mockGetPublicKey.mockResolvedValue({ publicKey: PUBLIC_KEY });

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

  it('signTransaction() returns the signature produced by the Str app', async () => {
    mockWebhidCreate.mockResolvedValue({ close: mockClose });
    mockGetPublicKey.mockResolvedValue({ publicKey: PUBLIC_KEY });
    mockSignTransaction.mockResolvedValue({ signature: 'signature-bytes' });

    const { result } = renderHook(() => useHardwareWallet());
    await act(async () => {
      await result.current.connect();
    });

    let signature: string | null = null;
    await act(async () => {
      signature = await result.current.signTransaction('AAAA...tx...');
    });

    await waitFor(() => expect(signature).not.toBeNull());
    expect(mockSignTransaction).toHaveBeenCalledWith(DEFAULT_PATH, 'AAAA...tx...');
    expect(signature).toBe('signature-bytes');
  });

  it('signTransaction() fails gracefully when no wallet is connected', async () => {
    const { result } = renderHook(() => useHardwareWallet());

    let signature: string | null = 'unset';
    await act(async () => {
      signature = await result.current.signTransaction('AAAA...tx...');
    });

    expect(signature).toBeNull();
    expect(result.current.error).toBe('Hardware wallet is not connected');
  });

  it('signPersonalMessage() returns a signature assembled from the Str app response', async () => {
    mockWebhidCreate.mockResolvedValue({ close: mockClose });
    mockGetPublicKey.mockResolvedValue({ publicKey: PUBLIC_KEY });
    mockSignTransaction.mockResolvedValue({ signature: 'sig' });

    const { result } = renderHook(() => useHardwareWallet());
    await act(async () => {
      await result.current.connect();
    });

    let signature: string | null = null;
    await act(async () => {
      signature = await result.current.signPersonalMessage('hello');
    });

    await waitFor(() => expect(signature).not.toBeNull());
    expect(signature).toBe('sig');
    expect(mockSignTransaction).toHaveBeenCalledWith(DEFAULT_PATH, expect.any(String));
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
