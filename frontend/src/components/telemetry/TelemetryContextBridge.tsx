'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { recordBreadcrumb } from '@/lib/telemetry/breadcrumbs';
import { setTelemetryWallet } from '@/lib/telemetry/context';
import { maskAddress } from '@/lib/telemetry/redact';

/**
 * Keeps crash telemetry aware of the connected wallet (FE-099).
 *
 * `ErrorBoundary` is a class component and cannot read the wallet context, so
 * this renderless component copies the active account and network into a small
 * module-level slot that `reportCrash` reads. Only a masked address is ever
 * reported; the full address stays in this slot and never leaves the browser.
 *
 * Mount it inside `WalletProvider`.
 */
export function TelemetryContextBridge() {
  const { publicKey, walletNetwork, activeNetwork } = useWallet();
  const network = walletNetwork ?? activeNetwork ?? null;

  useEffect(() => {
    setTelemetryWallet(publicKey, network);
  }, [publicKey, network]);

  const previous = useRef<string | null>(null);
  useEffect(() => {
    // The trail records that a wallet connected or disconnected, with the masked
    // address, so a crash report shows the sequence without the identifier.
    // Nothing is recorded for the initial "no wallet" state.
    if (publicKey !== previous.current) {
      if (publicKey) {
        recordBreadcrumb({
          category: 'wallet',
          message: `Wallet connected ${maskAddress(publicKey)}`,
        });
      } else if (previous.current) {
        recordBreadcrumb({ category: 'wallet', message: 'Wallet disconnected' });
      }
      previous.current = publicKey;
    }
  }, [publicKey]);

  return null;
}
