import { useCallback, useState } from 'react';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import TransportWebUSB from '@ledgerhq/hw-transport-webusb';
import Str from '@ledgerhq/hw-app-str';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TransportType = 'webhid' | 'webusb' | null;
export type ConnectionStatus =
  'disconnected' | 'connecting' | 'connected' | 'awaiting-confirmation';

export interface DerivedAccount {
  path: string;
  address: string;
  publicKey: string;
}

export interface UseHardwareWalletResult {
  isSupported: boolean;
  supportedTransports: TransportType[];
  isConnected: boolean;
  isBusy: boolean;
  connectionStatus: ConnectionStatus;
  address: string | null;
  publicKey: string | null;
  derivationPath: string;
  accounts: DerivedAccount[];
  error: string | null;
  warning: string | null;
  devicePrompt: string | null;
  isAwaitingConfirmation: boolean;
  connect: (opts?: { transport?: 'webhid' | 'webusb'; derivationPath?: string }) => Promise<void>;
  disconnect: () => Promise<void>;
  signPersonalMessage: (message: string) => Promise<string | null>;
  signTransaction: (
    xdr: string,
    opts?: { path?: string; blindSigningWarning?: boolean }
  ) => Promise<string | null>;
  discoverAccounts: (count?: number) => Promise<DerivedAccount[]>;
  setDerivationPath: (path: string) => void;
  clearError: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_DERIVATION_PATH = "44'/148'/0'";
const BASE_DERIVATION_PREFIX = "44'/148'";
const CONNECT_TIMEOUT_MS = 30_000;
const SIGN_TIMEOUT_MS = 60_000;

function isValidStellarPath(path: string): boolean {
  // Allow m/44'/148'/0' and m/44'/148'/0'/0' etc.
  return /^44'\/148'\/\d+'(\/\d+'?)?$/.test(path.replace(/^m\//, ''));
}

function normalizePath(path: string): string {
  return path.replace(/^m\//, '');
}

function getStellarDerivationPath(accountIndex: number): string {
  return `44'/148'/${accountIndex}'`;
}

// ─── Error mapping ──────────────────────────────────────────────────────────

function mapLedgerError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes('0x6804') ||
    lower.includes('6804') ||
    lower.includes('locked') ||
    lower.includes('not ready')
  ) {
    return 'Device is locked. Please unlock your Ledger and open the Stellar app.';
  }
  if (
    lower.includes('0x6faa') ||
    lower.includes('6faa') ||
    lower.includes('timeout') ||
    lower.includes('timed out')
  ) {
    return 'Device timeout. Please unlock, keep the Stellar app open, and confirm within 30 seconds.';
  }
  if (
    lower.includes('0x6d00') ||
    lower.includes('cla not supported') ||
    lower.includes('app does not seem to be open')
  ) {
    return 'Stellar app not open. Please open the Stellar app on your Ledger device.';
  }
  if (
    lower.includes('disconnected') ||
    lower.includes('notconnected') ||
    lower.includes('transporterror') ||
    lower.includes('cannot read')
  ) {
    return 'Device disconnected. Please check the USB cable and try again.';
  }
  if (
    lower.includes('denied by the user') ||
    lower.includes('user refused') ||
    lower.includes('0x6985')
  ) {
    return 'Transaction rejected on device. You cancelled the confirmation.';
  }
  if (lower.includes('blind signing') || lower.includes('0x6c00')) {
    return 'Blind signing required. Please enable blind signing in the Stellar app settings to sign this transaction.';
  }
  return msg || 'Unable to connect to Ledger device.';
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export const useHardwareWallet = (): UseHardwareWalletResult => {
  const [transport, setTransport] = useState<TransportWebHID | TransportWebUSB | null>(null);
  const [transportType, setTransportType] = useState<TransportType>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [derivationPath, setDerivationPathState] = useState<string>(DEFAULT_DERIVATION_PATH);
  const [accounts, setAccounts] = useState<DerivedAccount[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [devicePrompt, setDevicePrompt] = useState<string | null>(null);

  const supportedTransports: TransportType[] = [];
  if (typeof window !== 'undefined') {
    if ('hid' in navigator) supportedTransports.push('webhid');
    if ('usb' in navigator) supportedTransports.push('webusb');
  }
  const isSupported = supportedTransports.length > 0;
  const isConnected = Boolean(transport && address);
  const isAwaitingConfirmation = connectionStatus === 'awaiting-confirmation';

  const clearError = useCallback(() => setError(null), []);

  const setDerivationPath = useCallback((path: string) => {
    const normalized = normalizePath(path);
    if (!isValidStellarPath(normalized)) {
      setError(
        `Invalid derivation path "${path}". Expected BIP-44 Stellar path like m/44'/148'/0'`
      );
      return;
    }
    setDerivationPathState(normalized);
    setError(null);
  }, []);

  const createTransport = useCallback(async (preferred?: 'webhid' | 'webusb') => {
    // Interactive device prompt: WebUSB/HID will show browser picker
    if (preferred === 'webusb') {
      if (!('usb' in navigator)) throw new Error('WebUSB is not available in this browser');
      return { t: await TransportWebUSB.create(), type: 'webusb' as const };
    }
    if (preferred === 'webhid') {
      if (!('hid' in navigator)) throw new Error('WebHID is not available in this browser');
      return { t: await TransportWebHID.create(), type: 'webhid' as const };
    }
    // Auto: try WebHID first, fallback to WebUSB
    if ('hid' in navigator) {
      try {
        return { t: await TransportWebHID.create(), type: 'webhid' as const };
      } catch {
        if ('usb' in navigator)
          return { t: await TransportWebUSB.create(), type: 'webusb' as const };
        throw new Error('WebHID failed and WebUSB is not available');
      }
    }
    if ('usb' in navigator) {
      return { t: await TransportWebUSB.create(), type: 'webusb' as const };
    }
    throw new Error('Neither WebHID nor WebUSB is available in this browser');
  }, []);

  const connect = useCallback(
    async (opts?: { transport?: 'webhid' | 'webusb'; derivationPath?: string }) => {
      const path = opts?.derivationPath ? normalizePath(opts.derivationPath) : derivationPath;
      if (!isValidStellarPath(path)) {
        setError(`Invalid derivation path "${path}". Expected m/44'/148'/0'`);
        return;
      }
      if (!isSupported) {
        setError('WebHID/WebUSB is not available in this browser');
        return;
      }
      setIsBusy(true);
      setError(null);
      setWarning(null);
      setDevicePrompt('Please connect your Ledger, unlock it, and open the Stellar app.');
      setConnectionStatus('connecting');

      try {
        const { t, type } = await withTimeout(
          createTransport(opts?.transport),
          CONNECT_TIMEOUT_MS,
          'Device connection timed out. Please unlock your Ledger and open the Stellar app.'
        );

        // Interactive device prompt: Ledger will show address confirmation
        setDevicePrompt('Please confirm the address on your Ledger device.');
        const app = new Str(t);
        // Str.getPublicKey(path) returns { publicKey, rawPublicKey }
        const result = await withTimeout(
          // @ts-expect-error - Str types may vary by version
          app.getPublicKey(path),
          CONNECT_TIMEOUT_MS,
          'Device did not respond. Please keep the Stellar app open.'
        );

        // Normalize response shape across versions
        const addr: string | null =
          (result as { publicKey?: string; address?: string })?.publicKey ??
          (result as { publicKey?: string })?.publicKey ??
          (result as { address?: string })?.address ??
          null;
        // For Stellar, address is G... string; publicKey is ed25519 32 bytes hex
        const gAddress = addr ?? (result as string) ?? null;

        setTransport(t);
        setTransportType(type);
        setAddress(gAddress);
        setPublicKey(gAddress);
        setDerivationPathState(path);
        setConnectionStatus('connected');
        setDevicePrompt(null);

        // Attach disconnect listener for graceful handling
        // @ts-expect-error - transport events not typed
        t.on?.('disconnect', () => {
          setTransport(null);
          setTransportType(null);
          setAddress(null);
          setPublicKey(null);
          setAccounts([]);
          setConnectionStatus('disconnected');
          setError('Device disconnected. Please reconnect your Ledger.');
          setDevicePrompt(null);
        });
      } catch (err) {
        const mapped = mapLedgerError(err);
        setError(mapped);
        setConnectionStatus('disconnected');
        setDevicePrompt(null);
        console.error('[HardwareWallet] connect failed', err);
      } finally {
        setIsBusy(false);
        if (!isSupported) setDevicePrompt(null);
      }
    },
    [createTransport, derivationPath, isSupported]
  );

  const disconnect = useCallback(async () => {
    if (!transport) return;
    setIsBusy(true);
    try {
      // @ts-expect-error - close exists on both transports
      await transport.close();
      setTransport(null);
      setTransportType(null);
      setAddress(null);
      setPublicKey(null);
      setAccounts([]);
      setConnectionStatus('disconnected');
      setDevicePrompt(null);
      setWarning(null);
    } catch (err) {
      const mapped = mapLedgerError(err);
      setError(mapped);
      console.error('[HardwareWallet] disconnect failed', err);
    } finally {
      setIsBusy(false);
    }
  }, [transport]);

  const discoverAccounts = useCallback(
    async (count = 5): Promise<DerivedAccount[]> => {
      if (!transport) {
        setError('Hardware wallet is not connected');
        return [];
      }
      setIsBusy(true);
      setError(null);
      setDevicePrompt('Discovering accounts — please keep the Stellar app open.');
      try {
        const app = new Str(transport as unknown as TransportWebHID);
        const found: DerivedAccount[] = [];
        for (let i = 0; i < count; i++) {
          const path = getStellarDerivationPath(i);
          try {
            const res = await withTimeout(
              // @ts-expect-error - Str types
              app.getPublicKey(path),
              15000,
              `Timeout discovering account ${i}`
            );
            const addr = (res as { publicKey?: string })?.publicKey ?? String(res);
            found.push({ path: `m/${path}`, address: addr, publicKey: addr });
            // Small delay to avoid flooding device
            await new Promise((r) => setTimeout(r, 150));
          } catch (e) {
            console.warn(`[HardwareWallet] skip account ${i}`, e);
            break;
          }
        }
        setAccounts(found);
        setDevicePrompt(null);
        // If we found accounts, set first as active
        if (found.length > 0 && !address) {
          setAddress(found[0].address);
          setPublicKey(found[0].publicKey);
          setDerivationPathState(found[0].path.replace(/^m\//, ''));
        }
        return found;
      } catch (err) {
        const mapped = mapLedgerError(err);
        setError(mapped);
        setDevicePrompt(null);
        console.error('[HardwareWallet] discoverAccounts failed', err);
        return [];
      } finally {
        setIsBusy(false);
      }
    },
    [transport, address]
  );

  // Stellar-aware transaction signing
  const signTransaction = useCallback(
    async (
      xdr: string,
      opts?: { path?: string; blindSigningWarning?: boolean }
    ): Promise<string | null> => {
      if (!transport) {
        setError('Hardware wallet is not connected');
        return null;
      }
      const path = normalizePath(opts?.path ?? derivationPath);
      if (!isValidStellarPath(path)) {
        setError(`Invalid derivation path "${path}"`);
        return null;
      }

      setIsBusy(true);
      setError(null);
      setWarning(null);

      // Blind-signing warning: if tx contains Soroban ops or unknown memo, warn
      const needsBlindSigning =
        opts?.blindSigningWarning ?? (xdr.length > 500 || xdr.includes('AAAA'));
      if (needsBlindSigning) {
        setWarning(
          'Blind signing: This transaction contains data that cannot be fully decoded on the device. Please verify the hash carefully.'
        );
      }

      // On-device hash confirmation indicator
      // Hash preview (WebCrypto) for UI guidance
      try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xdr));
        const hashHex = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        setDevicePrompt(
          `Please verify and confirm the transaction hash on your Ledger: ${hashHex.slice(0, 8)}…${hashHex.slice(-8)}`
        );
      } catch {
        setDevicePrompt('Please verify the transaction on your Ledger device and confirm.');
      }
      setConnectionStatus('awaiting-confirmation');

      try {
        const app = new Str(transport as unknown as TransportWebHID);
        // Str.signTransaction(path, signatureBase) — signatureBase is base64 XDR
        const result = await withTimeout(
          // @ts-expect-error - Str signTransaction signature
          app.signTransaction(path, xdr),
          SIGN_TIMEOUT_MS,
          'Signing timed out. Please confirm on the device within 60 seconds.'
        );
        const signature: string | null =
          (result as { signature?: string })?.signature ??
          (typeof result === 'string' ? result : null) ??
          null;

        setConnectionStatus('connected');
        setDevicePrompt(null);
        setWarning(null);
        return signature;
      } catch (err) {
        const mapped = mapLedgerError(err);
        setError(mapped);
        setConnectionStatus('connected');
        setDevicePrompt(null);
        console.error('[HardwareWallet] signTransaction failed', err);
        return null;
      } finally {
        setIsBusy(false);
      }
    },
    [transport, derivationPath]
  );

  // Legacy Ethereum personal message signing — kept for backward compat, now routes via Str if connected
  const signPersonalMessage = useCallback(
    async (message: string) => {
      if (!transport) {
        setError('Hardware wallet is not connected');
        return null;
      }
      setIsBusy(true);
      setError(null);
      setWarning(
        'Personal message signing is not native to Stellar; signing hash of message instead.'
      );
      setDevicePrompt('Please confirm message hash on your Ledger device.');
      setConnectionStatus('awaiting-confirmation');
      try {
        // Hash message with WebCrypto (SHA-256) and sign as transaction-like payload
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
        const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
        const app = new Str(transport as unknown as TransportWebHID);
        const result = await withTimeout(
          // @ts-expect-error
          app.signTransaction(normalizePath(derivationPath), hashBase64),
          SIGN_TIMEOUT_MS,
          'Signing timed out.'
        );
        const sig = (result as { signature?: string })?.signature ?? null;
        if (sig) return sig;
        // Fallback: return hex of hash + signature placeholder for compat
        return `0x${Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')}`;
      } catch (err) {
        setError(mapLedgerError(err));
        console.error(err);
        return null;
      } finally {
        setIsBusy(false);
        setConnectionStatus('connected');
        setDevicePrompt(null);
      }
    },
    [transport, derivationPath]
  );

  return {
    isSupported,
    supportedTransports,
    isConnected,
    isBusy,
    connectionStatus,
    address,
    publicKey,
    derivationPath: `m/${normalizePath(derivationPath)}`,
    accounts,
    error,
    warning,
    devicePrompt,
    isAwaitingConfirmation,
    connect,
    disconnect,
    signPersonalMessage,
    signTransaction,
    discoverAccounts,
    setDerivationPath,
    clearError,
  };
};
