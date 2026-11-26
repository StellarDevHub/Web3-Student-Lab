/**
 * context.ts — what a crash report knows about the session (FE-099).
 *
 * The state snapshot is an **allowlist**, not a dump. `useGlobalStore.exportState`
 * serialises editor contents and user records, which have no business in a crash
 * report; this module instead lists the handful of fields that help diagnose a
 * render crash (route, connectivity, build, feature flags, network, whether
 * someone is signed in) and nothing else. Adding a field here is a deliberate act.
 *
 * The active wallet is held in a small module-level slot rather than read from
 * React context, because the error boundary is a class component that can sit
 * above or beside the wallet provider. `TelemetryContextBridge` keeps the slot
 * in sync. Only a masked form ever leaves this module.
 */

import { useAuthStore } from '@/stores/authStore';
import { useGlobalStore } from '@/stores/globalStore';
import { useNetworkStore } from '@/stores/networkStore';
import { maskAddress, redactUrl } from './redact';

let activeWallet: string | null = null;
let walletNetwork: string | null = null;

/** Called by the wallet bridge whenever the connected account or network changes. */
export function setTelemetryWallet(address: string | null, network?: string | null): void {
  activeWallet = address;
  walletNetwork = address ? (network ?? null) : null;
}

/** The active wallet, masked (`GABC…WXYZ`), or `null` when none is connected. */
export function getMaskedWallet(): string | null {
  return activeWallet ? maskAddress(activeWallet) : null;
}

export interface StateSnapshot {
  capturedAt: string;
  /** Path only; query strings and fragments are dropped. */
  route: string;
  online: boolean;
  environment: string;
  appVersion: string;
  buildNumber: string;
  features: Record<string, boolean>;
  /** App network setting (`mainnet` / `testnet` / `local`). */
  networkType: string | null;
  /** Network the connected wallet is on. */
  walletNetwork: string | null;
  /** Masked address. */
  wallet: string | null;
  authenticated: boolean;
  viewport: { width: number; height: number } | null;
  locale: string | null;
}

function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/** Capture the allowlisted snapshot. Never throws: a broken store must not break crash reporting. */
export function buildStateSnapshot(): StateSnapshot {
  const hasWindow = typeof window !== 'undefined';
  const global = safely(() => useGlobalStore.getState(), null);

  return {
    capturedAt: new Date().toISOString(),
    route: hasWindow ? redactUrl(window.location.href) : '',
    online: global?.isOnline ?? (typeof navigator !== 'undefined' ? navigator.onLine : true),
    environment: global?.environment ?? 'unknown',
    appVersion: global?.appVersion ?? '',
    buildNumber: global?.buildNumber ?? '',
    features: { ...(global?.features ?? {}) },
    networkType: safely(() => useNetworkStore.getState().networkType, null),
    walletNetwork,
    wallet: getMaskedWallet(),
    authenticated: safely(() => Boolean(useAuthStore.getState().isAuthenticated), false),
    viewport: hasWindow ? { width: window.innerWidth, height: window.innerHeight } : null,
    locale: typeof navigator !== 'undefined' ? navigator.language : null,
  };
}
